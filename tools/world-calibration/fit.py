"""Fit one display grade; measure validation on actual re-rendered PNGs."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import minimum_filter
from scipy.optimize import least_squares
from skimage.color import deltaE_ciede2000

from measure_reference import RGB_TO_XYZ, D65

ROOT = Path(__file__).resolve().parent
LABELS = ['other','grass','canopy','wall','roof','water','road','sky','shadow']
LUMA = np.array([.2126,.7152,.0722])

def load(path):
    return json.loads(path.read_text())

def save(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n')

def linear_image(path):
    rgb = np.asarray(Image.open(path).convert('RGB'), dtype=float) / 255
    return np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)

def lab(rgb):
    xyz = (rgb @ RGB_TO_XYZ.T) / D65
    d = 6/29
    f = np.where(xyz > d**3, np.cbrt(xyz), xyz/(3*d*d)+4/29)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],axis=-1)

def grade(rgb,p):
    y=(rgb@LUMA)[...,None]
    return np.clip((y+(rgb-y)*p[3])*p[:3],0,1)

def choose_regions(directory,frames):
    """Use geometry IDs and composition only. Never search by color error."""
    rows=[]
    for frame in frames:
        fid=frame['id']
        masks=[np.asarray(Image.open(directory/f'{fid}-{i}-mask.png'))[:,:,0] for i in range(3)]
        used=[np.zeros(m.shape,bool) for m in masks]
        for n,r in enumerate(frame['regions']):
            u,v,ur,vr=r['rect']
            center=np.array([(u+ur)/2,(v+vr)/2])
            klass=LABELS.index(r['material'])
            # Prefer pure 5x5 interiors. A 3x3 patch is permissible on thin roofs and lanes.
            candidates=[]
            for size in [5,3]:
                for shot,mask in enumerate(masks):
                    h,w=mask.shape
                    interior=minimum_filter(((mask==klass)&~used[shot]).astype('uint8'),size,mode='constant')
                    yy,xx=np.nonzero(interior)
                    if not len(yy):continue
                    score=(xx/w-center[0])**2+(yy/h-center[1])**2
                    # A compositional prior selects village, horizon, or shore first.
                    preferred=2 if r['material']=='water' else (1 if r['material']=='sky' else 0)
                    k=score.argmin()
                    candidates.append((score[k]+.15*(shot!=preferred),shot,int(xx[k]),int(yy[k]),size))
                if candidates:break
            if not candidates:
                rows.append(dict(frame=fid,index=n,split=frame['split'],material=r['material'],unmatched=True))
                continue
            _,shot,x,y,size=min(candidates)
            radius=size//2
            box=[x-radius,y-radius,x+radius+1,y+radius+1]
            used[shot][box[1]:box[3],box[0]:box[2]]=True
            rows.append(dict(frame=fid,index=n,split=frame['split'],material=r['material'],shot=shot,box=box,
                             reference=r['linearRGB']))
    return rows

def patches(directory,rows):
    cache={}
    result=[]
    for row in rows:
        key=(row['frame'],row['shot'])
        if key not in cache:cache[key]=linear_image(directory/f'{key[0]}-{key[1]}-beauty.png')
        left,top,right,bottom=row['box']
        result.append(cache[key][top:bottom,left:right].reshape(-1,3))
    return result

def means(pixels,p=None):
    return np.stack([(patch if p is None else grade(patch,p)).mean(axis=0) for patch in pixels])

def metrics(observed,target):
    predicted,reference=lab(observed),lab(target)
    return {'count':len(target),'cieLabRmse':float(np.sqrt(np.mean(np.sum((predicted-reference)**2,axis=1)))),
            'meanDeltaE00':float(deltaE_ciede2000(predicted,reference).mean()),
            'luminanceRmse':float(np.sqrt(np.mean(((observed-target)@LUMA)**2)))}

def describe(rgb):
    light,a,b=lab(rgb)
    chroma=float(np.hypot(a,b))
    return dict(Y=float(rgb@LUMA),L=float(light),C=chroma,h=float(np.degrees(np.arctan2(b,a))%360) if chroma>1e-6 else None)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline',type=Path)
    parser.add_argument('report',type=Path)
    parser.add_argument('--rendered',type=Path)
    args=parser.parse_args()
    args.report.mkdir(exist_ok=True,parents=True)
    frames=load(ROOT/'reference-regions.json')['frames']
    all_rows=choose_regions(args.baseline,frames)
    rows=[r for r in all_rows if not r.get('unmatched')]
    pixels=patches(args.baseline,rows)
    target=np.asarray([r['reference'] for r in rows])
    train=np.array([r['split']=='train' for r in rows])
    baseline=means(pixels)
    fit_pixels=[r for r,t in zip(pixels,train) if t]
    objective=lambda p:(lab(means(fit_pixels,p))-lab(target[train])).ravel()
    fit=least_squares(objective,np.ones(4),bounds=([.55,.55,.55,.60],[1.55,1.55,1.55,1.30]))
    if not fit.success:raise RuntimeError(str(fit.message))
    p=fit.x
    params={'gain':list(p[:3]),'saturation':float(p[3])}
    save(args.report/'grade.json',params)
    predicted=means(pixels,p)
    report={'parameters':params,'optimizerCalls':fit.nfev,'unmatched':[r for r in all_rows if r.get('unmatched')]}
    actual=means(patches(args.rendered,rows)) if args.rendered else None
    for split,mask in [('train',train),('validation',~train)]:
        report[split]={'baseline':metrics(baseline[mask],target[mask]),'predicted':metrics(predicted[mask],target[mask])}
        if actual is not None:report[split]['measured']=metrics(actual[mask],target[mask])
    print(json.dumps(report,indent=2))
    report['regions']=[dict(**row,baseline=describe(b),predicted=describe(pred),target=describe(t),
                            **({'measured':describe(actual[i])} if actual is not None else {}))
                      for i,(row,b,pred,t) in enumerate(zip(rows,baseline,predicted,target))]
    save(args.report/'report.json',report)
    if actual is not None:
        # Disqualify capture regressions, less than 100 fit samples, and failed generalization.
        valid=len(fit_pixels)>100 and (~train).sum()>=16 and all(
            report[s]['measured']['cieLabRmse']<report[s]['baseline']['cieLabRmse'] for s in ('train','validation'))
        if not valid:raise SystemExit('Insufficient matched coverage or no measured validation improvement; retain identity.')
        (args.report/'calibratedGrade.ts').write_text(
            '// Measured after ACES in tools/world-calibration. Gain and saturation act in display-linear sRGB.\n'
            'export const REFERENCE_GRADE = {\n  gain: [' + ', '.join(f'{v:.9f}' for v in p[:3]) +
            '] as [number, number, number],\n  saturation: ' + f'{p[3]:.9f}' + ',\n};\n')

if __name__=='__main__':main()
