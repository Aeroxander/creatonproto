import { Jwks } from '@creatonproto/jwk'
import { OAuthClientMetadata } from '@creatonproto/oauth-types'

export type { OAuthClientMetadata }

export type ClientData = {
  metadata: OAuthClientMetadata
  jwks?: Jwks
}
