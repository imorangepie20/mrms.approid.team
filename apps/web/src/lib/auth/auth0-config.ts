type Auth0Environment = {
  AUTH0_SECRET?: string;
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
  APP_BASE_URL?: string;
};

const requiredKeys: Array<keyof Auth0Environment> = [
  "AUTH0_SECRET",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "APP_BASE_URL",
];

export function hasAuth0Configuration(environment: Auth0Environment) {
  if (!requiredKeys.every((key) => Boolean(environment[key]?.trim()))) {
    return false;
  }

  try {
    const rawAppBaseUrl = environment.APP_BASE_URL!;
    if (rawAppBaseUrl.includes(",")) {
      return false;
    }

    const appBaseUrl = new URL(rawAppBaseUrl);
    return appBaseUrl.protocol === "https:" || appBaseUrl.protocol === "http:";
  } catch {
    return false;
  }
}
