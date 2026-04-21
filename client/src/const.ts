export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Keep the existing helper name to avoid touching every caller.
// The app's login entry is now the home screen, which renders the Google button.
export const getLoginUrl = () => "/";
