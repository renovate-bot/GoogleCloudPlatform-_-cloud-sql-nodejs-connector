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

import {resolve} from 'node:path';
import t from 'tap';
import nock from 'nock';
import {sqladmin_v1beta4} from '@googleapis/sqladmin';
import {SQLAdminFetcher} from '../src/sqladmin-fetcher';
import {InstanceConnectionInfo} from '../src/instance-connection-info';

const setupCredentials = (test: Tap.Test): void => {
  const path = test.testdir({
    credentials: JSON.stringify({
      client_secret: 'privatekey',
      client_id: 'client123',
      refresh_token: 'refreshtoken',
      type: 'authorized_user',
    }),
  });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = resolve(path, 'credentials');
  test.teardown(() => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = undefined;
  });

  nock('https://oauth2.googleapis.com')
    .post('/token')
    .reply(200, {access_token: 'abc123', expires_in: 1});
};

const mockRequest = (
  instanceInfo: InstanceConnectionInfo,
  overrides?: sqladmin_v1beta4.Schema$ConnectSettings
): void => {
  const {projectId, regionId, instanceId} = instanceInfo;

  nock('https://sqladmin.googleapis.com/sql/v1beta4/projects')
    .get(`/${projectId}/instances/${instanceId}/connectSettings`)
    .reply(200, {
      kind: 'sql#connectSettings',
      serverCaCert: {
        kind: 'sql#sslCert',
        certSerialNumber: '0',
        cert: '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----',
        commonName:
          'C=US,O=Google\\, Inc,CN=Google Cloud SQL Server CA,dnQualifier=1234',
        sha1Fingerprint: '004fe8623f02cb953bb5addbd0309f3b8f136c00',
        instance: instanceId,
        createTime: '2023-01-01T10:00:00.232Z',
        expirationTime: '2033-01-06T10:00:00.232Z',
      },
      ipAddresses: [
        {
          type: 'PRIMARY',
          ipAddress: '0.0.0.0',
        },
        {
          type: 'OUTGOING',
          ipAddress: '0.0.0.1',
        },
      ],
      region: regionId,
      databaseVersion: 'POSTGRES_14',
      backendType: 'SECOND_GEN',
      // overrides any properties from the base mock
      ...overrides,
    });
};

t.test('getInstanceMetadata', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'my-project',
    regionId: 'us-east1',
    instanceId: 'my-instance',
  };
  mockRequest(instanceConnectionInfo);

  const fetcher = new SQLAdminFetcher();
  const instanceMetadata = await fetcher.getInstanceMetadata(
    instanceConnectionInfo
  );
  t.same(
    instanceMetadata,
    {
      ipAddresses: {
        public: '0.0.0.0',
      },
      serverCaCert: {
        cert: '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----',
        expirationTime: '2033-01-06T10:00:00.232Z',
      },
    },
    'should return expected instance metadata object'
  );
});

t.test('getInstanceMetadata private ip', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'private-ip-project',
    regionId: 'us-east1',
    instanceId: 'private-ip-instance',
  };
  mockRequest(instanceConnectionInfo, {
    ipAddresses: [
      {
        type: 'PRIVATE',
        ipAddress: '0.0.0.0',
      },
    ],
  });

  const fetcher = new SQLAdminFetcher();
  const instanceMetadata = await fetcher.getInstanceMetadata(
    instanceConnectionInfo
  );
  t.match(
    instanceMetadata,
    {
      ipAddresses: {
        private: '0.0.0.0',
      },
    },
    'should return expected instance metadata containing private ip'
  );
});

t.test('getInstanceMetadata no valid ip addresses', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'no-ip-project',
    regionId: 'us-east1',
    instanceId: 'no-ip-instance',
  };
  mockRequest(instanceConnectionInfo, {
    ipAddresses: [
      {
        type: 'OUTGOING',
        ipAddress: '0.0.0.1',
      },
    ],
  });

  const fetcher = new SQLAdminFetcher();
  t.rejects(
    fetcher.getInstanceMetadata(instanceConnectionInfo),
    {
      code: 'ENOSQLADMINIPADDRESS',
    },
    'should throw no ip address error'
  );
});

t.test('getInstanceMetadata no valid cert', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'no-cert-project',
    regionId: 'us-east1',
    instanceId: 'no-cert-instance',
  };
  mockRequest(instanceConnectionInfo, {
    serverCaCert: {},
  });

  const fetcher = new SQLAdminFetcher();
  t.rejects(
    fetcher.getInstanceMetadata(instanceConnectionInfo),
    {
      code: 'ENOSQLADMINCERT',
    },
    'should throw no cert error'
  );
});

t.test('getInstanceMetadata no response data', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'no-response-data-project',
    regionId: 'us-east1',
    instanceId: 'no-response-data-instance',
  };
  nock('https://sqladmin.googleapis.com/sql/v1beta4/projects')
    .get(
      '/no-response-data-project/instances/no-response-data-instance/connectSettings'
    )
    .reply(200, '');

  const fetcher = new SQLAdminFetcher();
  t.rejects(
    fetcher.getInstanceMetadata(instanceConnectionInfo),
    {
      message:
        'Failed to find metadata on project id: no-response-data-project and instance id: no-response-data-instance. Ensure network connectivity and validate the provided `instanceConnectionName` config value',
      code: 'ENOSQLADMIN',
    },
    'should throw no response data error'
  );
});

t.test('getInstanceMetadata invalid response data', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'invalid-project',
    regionId: 'us-east1',
    instanceId: 'invalid-instance',
  };
  nock('https://sqladmin.googleapis.com/sql/v1beta4/projects')
    .get('/invalid-project/instances/invalid-instance/connectSettings')
    .reply(200, {foo: 'bar'});

  const fetcher = new SQLAdminFetcher();
  t.rejects(
    fetcher.getInstanceMetadata(instanceConnectionInfo),
    {
      code: 'ENOSQLADMINIPADDRESS',
    },
    'should throw on invalid response data'
  );
});

t.test('getInstanceMetadata no valid region', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'no-region-project',
    regionId: 'us-east1',
    instanceId: 'no-region-instance',
  };
  mockRequest(instanceConnectionInfo, {
    region: undefined,
  });

  const fetcher = new SQLAdminFetcher();
  t.rejects(
    fetcher.getInstanceMetadata(instanceConnectionInfo),
    {
      code: 'ENOSQLADMINREGION',
    },
    'should throw no region found error'
  );
});

t.test('getInstanceMetadata invalid region', async t => {
  setupCredentials(t);
  const instanceConnectionInfo: InstanceConnectionInfo = {
    projectId: 'invalid-region-project',
    regionId: 'us-east1',
    instanceId: 'invalid-region-instance',
  };
  mockRequest(instanceConnectionInfo, {
    region: 'something-else',
  });

  const fetcher = new SQLAdminFetcher();
  t.rejects(
    fetcher.getInstanceMetadata(instanceConnectionInfo),
    {
      message:
        'Provided region was mismatched. Got something-else, want us-east1',
      code: 'EBADSQLADMINREGION',
    },
    'should throw invalid region error'
  );
});