export const MIN_FITTED_FONT_SIZE = 2;

/** Find the largest whole-pixel font size accepted by a monotonic fit check. */
export const findLargestFittingFontSize = (
  fits: (fontSize: number) => boolean,
  minFontSize = MIN_FITTED_FONT_SIZE,
  maxFontSize = 2048,
): number => {
  let low = Math.max(1, Math.ceil(minFontSize));
  let high = Math.max(low, Math.floor(maxFontSize));
  let best = low;

  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    if (fits(candidate)) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }

  return best;
};
