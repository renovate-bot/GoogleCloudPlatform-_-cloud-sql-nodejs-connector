// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {AuthClient, GoogleAuth} from 'google-auth-library';
import {sqladmin_v1beta4} from '@googleapis/sqladmin';
import {instance as gaxios} from 'gaxios';
const {Sqladmin} = sqladmin_v1beta4;
import {InstanceConnectionInfo} from './instance-connection-info';
import {SslCert} from './ssl-cert';
import {parseCert} from './crypto';
import {IpAddresses} from './ip-addresses';
import {CloudSQLConnectorError} from './errors';
import {getNearestExpiration} from './time';
import {AuthTypes} from './auth-types';

export interface InstanceMetadata {
  ipAddresses: IpAddresses;
  serverCaCert: SslCert;
  serverCaMode: string;
  dnsName: string;
}

interface RequestBody {
  public_key: string;
  access_token?: string;
}

// Default values for the list of http methods to retry in gaxios
// ref: https://github.com/googleapis/gaxios/tree/fdb6a8e542f7782f8d1e487c0ef7d301fa231d18#request-options
const defaultGaxiosHttpMethodsToRetry = [
  'GET',
  'HEAD',
  'PUT',
  'OPTIONS',
  'DELETE',
];

// https://github.com/googleapis/gaxios is the http request library used by
// google-auth-library and other Cloud SDK libraries, this function will set
// a standard default configuration that will ensure retry works as expected
// for internal google-auth-library requests.
function setupGaxiosConfig() {
  gaxios.defaults = {
    retryConfig: {
      retry: 5,
      // Make sure to add POST to the list of default methods to retry
      // since it's used in IAM generateAccessToken requests that needs retry
      httpMethodsToRetry: ['POST', ...defaultGaxiosHttpMethodsToRetry],
      // Should retry on non-http error codes such as ECONNRESET, ETIMEOUT, etc
      noResponseRetries: 3,
      // Defaults to: [[100, 199], [408, 408], [429, 429], [500, 599]]
      statusCodesToRetry: [[500, 599]],
      // The amount of time to initially delay the retry, in ms. Defaults to 100ms.
      retryDelay: 200,
      // The multiplier by which to increase the delay time between the
      // completion of failed requests, and the initiation of the subsequent
      // retrying request. Defaults to 2.
      retryDelayMultiplier: 1.618,
    },
  };
}

const defaultGaxiosConfig = gaxios.defaults;
// resumes the previous default gaxios config in order to reduce the chance of
// affecting other libraries that might be sharing that same gaxios instance
function cleanGaxiosConfig() {
  gaxios.defaults = defaultGaxiosConfig;
}

export interface SQLAdminFetcherOptions {
  loginAuth?: GoogleAuth<AuthClient> | AuthClient;
  sqlAdminAPIEndpoint?: string;
  universeDomain?: string;
  userAgent?: string;
}

export class SQLAdminFetcher {
  private readonly client: sqladmin_v1beta4.Sqladmin;
  private readonly auth: GoogleAuth<AuthClient>;

  constructor({
    loginAuth,
    sqlAdminAPIEndpoint,
    universeDomain,
    userAgent,
  }: SQLAdminFetcherOptions = {}) {
    let auth: GoogleAuth<AuthClient>;

    if (loginAuth instanceof GoogleAuth) {
      auth = loginAuth;
    } else {
      auth = new GoogleAuth({
        authClient: loginAuth, // either an `AuthClient` or undefined
        scopes: ['https://www.googleapis.com/auth/sqlservice.admin'],
      });
    }

    this.client = new Sqladmin({
      rootUrl: sqlAdminAPIEndpoint,
      auth: auth as GoogleAuth,
      userAgentDirectives: [
        {
          product: 'cloud-sql-nodejs-connector',
          version: 'LIBRARY_SEMVER_VERSION',
          comment: userAgent,
        },
      ],
      universeDomain: universeDomain,
    });

    if (loginAuth instanceof GoogleAuth) {
      this.auth = loginAuth;
    } else {
      this.auth = new GoogleAuth({
        authClient: loginAuth, // either an `AuthClient` or undefined
        scopes: ['https://www.googleapis.com/auth/sqlservice.login'],
      });
    }
  }

  private parseIpAddresses(
    ipResponse: sqladmin_v1beta4.Schema$IpMapping[] | undefined,
    dnsName: string | null | undefined,
    dnsNames: sqladmin_v1beta4.Schema$DnsNameMapping[] | null | undefined,
    pscEnabled: boolean | null | undefined
  ): IpAddresses {
    const ipAddresses: IpAddresses = {};
    if (ipResponse) {
      for (const ip of ipResponse) {
        if (ip.type === 'PRIMARY' && ip.ipAddress) {
          ipAddresses.public = ip.ipAddress;
        }
        if (ip.type === 'PRIVATE' && ip.ipAddress) {
          ipAddresses.private = ip.ipAddress;
        }
      }
    }

    // Resolve dnsName into IP address for PSC enabled instances.
    // Note that we have to check for PSC enablement because CAS instances
    // also set the dnsName field.

    // Search the dns_names field for the PSC DNS Name.
    if (dnsNames) {
      for (const dnm of dnsNames) {
        if (
          dnm.name &&
          dnm.connectionType === 'PRIVATE_SERVICE_CONNECT' &&
          dnm.dnsScope === 'INSTANCE'
        ) {
          ipAddresses.psc = dnm.name;
          break;
        }
      }
    }

    // If the psc dns name was not found, use the legacy dns_name field
    if (!ipAddresses.psc && dnsName && pscEnabled) {
      ipAddresses.psc = dnsName;
    }

    if (!ipAddresses.public && !ipAddresses.private && !ipAddresses.psc) {
      throw new CloudSQLConnectorError({
        message: 'Cannot connect to instance, it has no supported IP addresses',
        code: 'ENOSQLADMINIPADDRESS',
      });
    }

    return ipAddresses;
  }

  async getInstanceMetadata({
    projectId,
    regionId,
    instanceId,
  }: InstanceConnectionInfo): Promise<InstanceMetadata> {
    setupGaxiosConfig();

    const res = await this.client.connect.get({
      project: projectId,
      instance: instanceId,
    });

    if (!res.data) {
      throw new CloudSQLConnectorError({
        message:
          `Failed to find metadata on project id: ${projectId} ` +
          `and instance id: ${instanceId}. Ensure network connectivity and ` +
          'validate the provided `instanceConnectionName` config value',
        code: 'ENOSQLADMIN',
      });
    }

    const ipAddresses = this.parseIpAddresses(
      res.data.ipAddresses,
      res.data.dnsName,
      res.data.dnsNames,
      res.data.pscEnabled
    );

    const {serverCaCert} = res.data;
    if (!serverCaCert || !serverCaCert.cert || !serverCaCert.expirationTime) {
      throw new CloudSQLConnectorError({
        message: 'Cannot connect to instance, no valid CA certificate found',
        code: 'ENOSQLADMINCERT',
      });
    }

    const {region} = res.data;
    if (!region) {
      throw new CloudSQLConnectorError({
        message: 'Cannot connect to instance, no valid region found',
        code: 'ENOSQLADMINREGION',
      });
    }
    if (region !== regionId) {
      throw new CloudSQLConnectorError({
        message: `Provided region was mismatched. Got ${region}, want ${regionId}`,
        code: 'EBADSQLADMINREGION',
      });
    }

    cleanGaxiosConfig();
    // Find a DNS name to use to validate the certificate from the dns_names field. Any
    // name in the list may be used to validate the server TLS certificate.
    // Fall back to legacy dns_name field if necessary.
    let serverName = null;
    if (res.data.dnsNames && res.data.dnsNames.length > 0) {
      serverName = res.data.dnsNames[0].name;
    }
    if (serverName === null) {
      serverName = res.data.dnsName;
    }

    return {
      ipAddresses,
      serverCaCert: {
        cert: serverCaCert.cert,
        expirationTime: serverCaCert.expirationTime,
      },
      serverCaMode: res.data.serverCaMode || '',
      dnsName: serverName || '',
    };
  }

  async getEphemeralCertificate(
    {projectId, instanceId}: InstanceConnectionInfo,
    publicKey: string,
    authType: AuthTypes
  ): Promise<SslCert> {
    setupGaxiosConfig();

    const requestBody: RequestBody = {
      public_key: publicKey,
    };

    let tokenExpiration;
    if (authType === AuthTypes.IAM) {
      const access_token = await this.auth.getAccessToken();
      const client = await this.auth.getClient();
      if (access_token) {
        tokenExpiration = client.credentials.expiry_date;
        requestBody.access_token = access_token;
      } else {
        throw new CloudSQLConnectorError({
          message:
            'Failed to get access token for automatic IAM authentication.',
          code: 'ENOACCESSTOKEN',
        });
      }
    }
    const res = await this.client.connect.generateEphemeralCert({
      project: projectId,
      instance: instanceId,
      requestBody,
    });

    if (!res.data) {
      throw new CloudSQLConnectorError({
        message:
          `Failed to find metadata on project id: ${projectId} ` +
          `and instance id: ${instanceId}. Ensure network connectivity and ` +
          'validate the provided `instanceConnectionName` config value',
        code: 'ENOSQLADMIN',
      });
    }

    const {ephemeralCert} = res.data;
    if (!ephemeralCert || !ephemeralCert.cert) {
      throw new CloudSQLConnectorError({
        message:
          'Cannot connect to instance, failed to retrieve an ephemeral certificate',
        code: 'ENOSQLADMINEPH',
      });
    }

    // NOTE: If the SQL Admin generateEphemeralCert API starts returning
    // the expirationTime info, this certificate parsing is no longer needed
    const {cert, expirationTime} = await parseCert(ephemeralCert.cert);

    const nearestExpiration = getNearestExpiration(
      Date.parse(expirationTime),
      tokenExpiration
    );

    cleanGaxiosConfig();

    return {
      cert,
      expirationTime: nearestExpiration,
    };
  }
}
