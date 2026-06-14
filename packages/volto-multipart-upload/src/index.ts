import type { ConfigType } from '@plone/registry';
import { multipartUploadExtender } from './middleware/multipartUpload';

function applyConfig(config: ConfigType) {
  (config.settings as any).storeExtenders = [
    ...((config.settings as any).storeExtenders || []),
    multipartUploadExtender,
  ];
  return config;
}

export default applyConfig;
