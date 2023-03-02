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

import tls from 'node:tls';
import {InstanceConnectionInfo} from './instance-connection-info';
import {SslCert} from './ssl-cert';

interface SocketOptions {
  ephemeralCert: SslCert;
  host: string;
  instanceInfo: InstanceConnectionInfo;
  privateKey: string;
  serverCaCert: SslCert;
}

const noCertValidationError = () =>
  Object.assign(new Error('No certificate to verify'), {
    code: 'ENOSQLADMINVERIFYCERT',
  });

const badCertValidationError = (certificateName: string, expected: string) =>
  Object.assign(
    new Error(`Certificate had CN ${certificateName}, expected ${expected}`),
    {code: 'EBADSQLADMINVERIFYCERT'}
  );

export function validateCertificate(instanceInfo: InstanceConnectionInfo) {
  return (hostname: string, cert: tls.PeerCertificate): Error | undefined => {
    if (!cert || !cert.subject) {
      return noCertValidationError();
    }
    const expectedCN = `${instanceInfo.projectId}:${instanceInfo.instanceId}`;
    if (cert.subject.CN !== expectedCN) {
      return badCertValidationError(cert.subject.CN, expectedCN);
    }
    return undefined;
  };
}

export function getSocket({
  ephemeralCert,
  host,
  instanceInfo,
  privateKey,
  serverCaCert,
}: SocketOptions): tls.TLSSocket {
  const socketOpts = {
    host,
    port: 3307,
    secureContext: tls.createSecureContext({
      ca: serverCaCert.cert,
      cert: ephemeralCert.cert,
      key: privateKey,
      minVersion: 'TLSv1.3',
    }),
    checkServerIdentity: validateCertificate(instanceInfo),
  };
  const tlsSocket = tls.connect(socketOpts);
  // overrides the stream.connect method since the stream is already
  // connected and some drivers might try to call it internally
  tlsSocket.connect = () => tlsSocket;
  return tlsSocket;
}