/**
 * Shared layout constants.
 *
 * The conversation column must NOT stretch with the viewport: messages, the
 * composer and the welcome cards all sit in one fixed-width band, centred, so
 * they stay aligned with each other however wide the window gets. That only
 * holds if there is exactly one definition of the width — three copies of
 * `max-w-3xl` would drift the first time one of them is adjusted.
 */
export const CONTENT_WIDTH = "mx-auto w-full max-w-3xl";
