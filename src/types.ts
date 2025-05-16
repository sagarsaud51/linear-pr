export interface Config {
    githubToken?: string;
    linearAccessToken?: string;
    linearRefreshToken?: string;
    linearTokenExpiry?: number;
    githubRepo?: string;
    defaultBranch?: string;
    linearOAuthClientId?: string;
    linearOAuthClientSecret?: string;
  }