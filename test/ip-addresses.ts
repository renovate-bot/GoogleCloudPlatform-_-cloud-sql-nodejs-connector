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

import t from 'tap';
import {IpAddressTypes, selectIpAddress} from '../src/ip-addresses';

t.throws(
  () => selectIpAddress({}, IpAddressTypes.PUBLIC),
  {code: 'ENOPUBLICSQLADMINIPADDRESS'},
  'should throw if no public ip defined'
);

t.throws(
  () => selectIpAddress({}, IpAddressTypes.PRIVATE),
  {code: 'ENOPRIVATESQLADMINIPADDRESS'},
  'should throw if no private ip defined'
);

t.throws(
  () => selectIpAddress({}, IpAddressTypes.PSC),
  {code: 'ENOPSCSQLADMINIPADDRESS'},
  'should throw if no psc ip defined'
);

t.throws(
  () => selectIpAddress({}, undefined),
  {code: 'ENOSQLADMINIPADDRESS'},
  'should throw if no ips defined'
);

t.same(
  selectIpAddress(
    {
      public: '0.0.0.0',
      private: '0.0.0.2',
    },
    IpAddressTypes.PUBLIC
  ),
  '0.0.0.0',
  'should select public ip'
);

t.same(
  selectIpAddress(
    {
      private: '0.0.0.2',
    },
    IpAddressTypes.PRIVATE
  ),
  '0.0.0.2',
  'should select private ip'
);

t.same(
  selectIpAddress(
    {
      public: '0.0.0.0',
      private: '0.0.0.2',
      psc: 'abcde.12345.us-central1.sql.goog',
    },
    IpAddressTypes.PSC
  ),
  'abcde.12345.us-central1.sql.goog',
  'should select psc ip'
);
