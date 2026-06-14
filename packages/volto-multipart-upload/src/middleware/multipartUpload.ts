import config from '@plone/volto/registry';

/** A file field as stored by Volto widgets before upload. */
interface Base64FileField {
  data: string;
  encoding: string;
  'content-type'?: string;
  filename?: string;
}

/** A single request as produced by `createContent`/`updateContent`. */
interface RequestItem {
  op: string;
  path: string;
  data: Record<string, unknown>;
}

/** The relevant subset of a `CREATE_CONTENT`/`UPDATE_CONTENT` action. */
interface ContentAction {
  type: string;
  subrequest?: string;
  request?: RequestItem | RequestItem[];
}

/** Minimal Redux store surface used by the middleware. */
interface StoreLike {
  getState: () => { userSession?: { token?: string } };
  dispatch: (action: unknown) => unknown;
}

type Dispatch = (action: unknown) => unknown;
type Middleware = (store: StoreLike) => (next: Dispatch) => Dispatch;

function isBase64FileField(value: unknown): value is Base64FileField {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Base64FileField).encoding === 'base64' &&
    typeof (value as Base64FileField).data === 'string'
  );
}

function base64ToBlob(base64: string, contentType?: string): Blob {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: contentType || 'application/octet-stream' });
}

function findBase64FileFields(
  data: Record<string, unknown> | undefined,
): Array<{ fieldName: string; fieldData: Base64FileField }> {
  if (!data || typeof data !== 'object') return [];
  const fields: Array<{ fieldName: string; fieldData: Base64FileField }> = [];
  for (const [fieldName, fieldValue] of Object.entries(data)) {
    if (isBase64FileField(fieldValue)) {
      fields.push({ fieldName, fieldData: fieldValue });
    }
  }
  return fields;
}

function buildApiUrl(path: string): string {
  const { settings } = config;
  const apiSuffix = settings.legacyTraverse ? '' : '/++api++';
  return `${apiSuffix}${path}`;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function parseResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const error = new Error(
      errorData?.message || `Upload failed with status ${response.status}`,
    ) as Error & { status?: number; data?: unknown };
    error.status = response.status;
    error.data = errorData;
    throw error;
  }
  // PATCH typically returns 204 No Content with an empty body.
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Upload a single `{ op, path, data }` request item.
 * If the data carries base64 file fields, send them as multipart/form-data
 * (plone.restapi#1953); otherwise fall back to a plain JSON request.
 */
async function uploadItem(
  item: RequestItem,
  token?: string,
): Promise<Record<string, unknown>> {
  const method = item.op === 'patch' ? 'PATCH' : 'POST';
  const url = buildApiUrl(item.path);
  const base64Fields = findBase64FileFields(item.data);

  if (base64Fields.length === 0) {
    const response = await fetch(url, {
      method,
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(item.data),
    });
    return parseResponse(response);
  }

  const modifiedData: Record<string, unknown> = { ...item.data };
  const fileParts: Array<{ ref: string; fieldData: Base64FileField }> = [];
  for (const { fieldName, fieldData } of base64Fields) {
    const ref = crypto.randomUUID();
    modifiedData[fieldName] = { data: ref };
    fileParts.push({ ref, fieldData });
  }

  const formData = new FormData();
  formData.append(
    'data',
    new Blob([JSON.stringify(modifiedData)], { type: 'application/json' }),
  );
  for (const { ref, fieldData } of fileParts) {
    const blob = base64ToBlob(
      fieldData.data,
      fieldData['content-type'] || 'application/octet-stream',
    );
    formData.append(ref, blob, fieldData.filename || 'file');
  }

  const response = await fetch(url, {
    method,
    headers: authHeaders(token),
    body: formData,
  });
  return parseResponse(response);
}

/**
 * Does this action carry at least one base64 file field worth converting to
 * multipart? Handles both the single-object and array (batch) request shapes
 * produced by `createContent`/`updateContent`.
 */
function actionHasBase64Upload(action: ContentAction): boolean {
  const { request } = action;
  if (!request) return false;
  if (Array.isArray(request)) {
    return request.some((item) => findBase64FileFields(item.data).length > 0);
  }
  return findBase64FileFields(request.data).length > 0;
}

async function handleMultipart(
  store: StoreLike,
  action: ContentAction,
): Promise<Record<string, unknown> | Array<Record<string, unknown>>> {
  const request = action.request!;
  const token = store.getState().userSession?.token;

  if (!Array.isArray(request)) {
    return uploadItem(request, token);
  }

  // Batch: upload serially so the "batch-upload" progress counter advances
  // exactly like Volto's api middleware does.
  const results: Array<Record<string, unknown>> = [];
  let uploadedFiles = 0;
  for (const item of request) {
    const result = await uploadItem(item, token);
    results.push(result);
    if (action.subrequest === 'batch-upload') {
      store.dispatch({
        type: 'UPDATE_UPLOADED_FILES',
        uploadedFiles: ++uploadedFiles,
      });
    }
  }
  if (uploadedFiles !== 0) {
    store.dispatch({ type: 'UPDATE_UPLOADED_FILES', uploadedFiles: 0 });
  }
  return results;
}

const multipartUploadMiddleware: Middleware = (store) => (next) => (action) => {
  const contentAction = action as ContentAction;
  if (
    contentAction.type !== 'CREATE_CONTENT' &&
    contentAction.type !== 'UPDATE_CONTENT'
  ) {
    return next(action);
  }
  if (!actionHasBase64Upload(contentAction)) {
    return next(action);
  }

  const pendingType = `${contentAction.type}_PENDING`;
  const successType = `${contentAction.type}_SUCCESS`;
  const failType = `${contentAction.type}_FAIL`;

  store.dispatch({ type: pendingType, subrequest: contentAction.subrequest });

  return handleMultipart(store, contentAction)
    .then((result) => {
      store.dispatch({
        type: successType,
        result,
        subrequest: contentAction.subrequest,
      });
      return result;
    })
    .catch((error) => {
      store.dispatch({
        type: failType,
        error,
        subrequest: contentAction.subrequest,
      });
      throw error;
    });
};

export function multipartUploadExtender(
  middlewareStack: Middleware[],
): Middleware[] {
  return [multipartUploadMiddleware, ...middlewareStack];
}
