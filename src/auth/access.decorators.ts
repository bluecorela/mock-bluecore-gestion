import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_KEY = 'publicRoute';
export const ANY_AUTHENTICATED_ROLE_KEY = 'anyAuthenticatedRole';

export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
export const AnyAuthenticatedRole = () =>
  SetMetadata(ANY_AUTHENTICATED_ROLE_KEY, true);

export const OAUTH_CLIENT_ROUTE_KEY = 'oauthClientRoute';
export const OAuthClientRoute = () => SetMetadata(OAUTH_CLIENT_ROUTE_KEY, true);

export const SKIP_APP_CHECK_KEY = 'skipAppCheck';
export const SkipAppCheck = () => SetMetadata(SKIP_APP_CHECK_KEY, true);
