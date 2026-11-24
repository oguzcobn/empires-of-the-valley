// Fitted display-linear gain and saturation. Identity is used until a measured
// candidate improves both training and independent validation frames.
export const REFERENCE_GRADE = {
  gain: [1, 1, 1] as [number, number, number],
  saturation: 1,
};
