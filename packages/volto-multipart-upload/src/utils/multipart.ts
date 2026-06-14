import config from '@plone/volto/registry';

export interface UploadFileMultipartOptions {
  /** Plone content path where the item is created (e.g. '/folder1'). */
  path: string;
  /** The file to upload. */
  file: File;
  /** Content title (defaults to `file.name`). */
  title?: string;
  /** Bearer token for authenticated requests. */
  token?: string;
}

/**
 * Upload a single file to Plone using multipart/form-data (plone.restapi#1953).
 *
 * The multipart payload format:
 *   - "data" part: JSON blob with @type, title, and a UUID reference for the file field
 *   - "<uuid>" part: the actual binary file
 *
 * @returns The created content JSON.
 */
export async function uploadFileMultipart({
  path,
  file,
  title,
  token,
}: UploadFileMultipartOptions): Promise<Record<string, unknown>> {
  const { settings } = config;
  const apiSuffix = settings.legacyTraverse ? '' : '/++api++';
  const url = `${apiSuffix}${path}`;

  const isImage = file.type.startsWith('image/');
  const fieldName = isImage ? 'image' : 'file';
  const contentType = isImage ? 'Image' : 'File';
  const ref = crypto.randomUUID();

  const jsonData = {
    '@type': contentType,
    title: title || file.name,
    [fieldName]: { data: ref },
  };

  const formData = new FormData();
  formData.append(
    'data',
    new Blob([JSON.stringify(jsonData)], { type: 'application/json' }),
  );
  formData.append(ref, file, file.name);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const error = new Error(
      errorData?.message || `Upload failed with status ${response.status}`,
    ) as Error & { status?: number; data?: unknown };
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  return response.json();
}
