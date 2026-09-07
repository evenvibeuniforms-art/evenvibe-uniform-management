export const REGULAR_UNIFORM_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42"] as const;
export const TSHIRT_UNIFORM_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export const PANT_SHORT_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42"] as const;

export const UNIFORM_TYPES = {
  REGULAR: "regular",
  TSHIRT: "tshirt",
} as const;

export type UniformType = typeof UNIFORM_TYPES[keyof typeof UNIFORM_TYPES];
