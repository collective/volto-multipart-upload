# Volto Add-on (volto-multipart-upload)

Upload files and images to Plone using `multipart/form-data` instead of base64-encoded JSON.

[![npm](https://img.shields.io/npm/v/volto-multipart-upload)](https://www.npmjs.com/package/volto-multipart-upload)
[![](https://img.shields.io/badge/-Storybook-ff4785?logo=Storybook&logoColor=white&style=flat-square)](https://collective.github.io/volto-multipart-upload/)
[![CI](https://github.com/collective/volto-multipart-upload/actions/workflows/main.yml/badge.svg)](https://github.com/collective/volto-multipart-upload/actions/workflows/main.yml)

## What it does

By default, Volto uploads binary content (files and images) by reading the file
into a base64 string and embedding it inside a JSON request body. This has two
costs:

- **~33% larger payloads** — base64 inflates the binary by a third over the wire.
- **High memory usage** — the whole file is held in memory as a base64 string on
  the client, encoded into JSON, then decoded again on the server.

This add-on switches every content-creation upload path to
`multipart/form-data`, sending the binary as-is. Once installed it is **always
active** — there is no feature flag.

### How it works

The add-on intercepts the relevant uploads at two levels:

1. **A Redux store middleware** (registered via `config.settings.storeExtenders`)
   that watches `CREATE_CONTENT` and `UPDATE_CONTENT` actions. When an action
   carries a field with `encoding: 'base64'` (the shape produced by Volto's
   `FileWidget`/`ImageWidget` and by the folder-contents batch upload), the
   middleware decodes the base64 back into a `Blob`, repackages the request as
   `multipart/form-data`, and sends it directly with `fetch` — dispatching the
   usual `_SUCCESS`/`_FAIL` actions so the rest of Volto behaves unchanged. This
   covers the **Add** and **Edit** forms (any `File`/`Image` content type), as
   well as the drag-and-drop batch upload in the folder Contents view.

2. **A shadowed `ContentsUploadModal`** that passes the selected `File` objects
   straight to `multipart/form-data`, avoiding the base64 round-trip in memory
   entirely for the "Upload" action in the folder Contents view (the main benefit
   for large or numerous files).

### Multipart request format

The payload follows the format implemented in **plone.restapi PR
[#1953](https://github.com/plone/plone.restapi/pull/1953)**:

- a part named `data` containing the JSON body, where each file field holds a
  UUID placeholder instead of the binary, e.g. `{"@type": "File", "file": {"data": "<uuid>"}}`;
- one additional part per file, named with that same UUID, carrying the raw
  binary (with its filename and content type).

### ⚠️ Backend requirement

This add-on **requires a Plone backend with multipart upload support**, i.e. the
changes from plone.restapi
[#1953](https://github.com/plone/plone.restapi/pull/1953). On a backend without
that support the multipart requests will be rejected. Make sure your
`plone.restapi` version includes that PR before installing this add-on.

## Features

- `multipart/form-data` upload for the Add and Edit forms (`File`, `Image`, and
  any content type with a file/image field).
- `multipart/form-data` upload for the folder Contents view, both the "Upload"
  action and drag-and-drop, including batch uploads.
- No configuration and no feature flag: installing the add-on enables it.

## Installation

To install your project, you must choose the method appropriate to your version of Volto.


### Volto 18 and later

Add `volto-multipart-upload` to your `package.json`:

```json
"dependencies": {
    "volto-multipart-upload": "*"
}
```

Add `volto-multipart-upload` to your `volto.config.js`:

```javascript
const addons = ['volto-multipart-upload'];
```

If this package provides a Volto theme, and you want to activate it, then add the following to your `volto.config.js`:

```javascript
const theme = 'volto-multipart-upload';
```

### Volto 17 and earlier

Create a new Volto project (you can skip this step if you already have one):

```
npm install -g yo @plone/generator-volto
yo @plone/volto my-volto-project --addon volto-multipart-upload
cd my-volto-project
```

Add `volto-multipart-upload` to your package.json:

```JSON
"addons": [
    "volto-multipart-upload"
],

"dependencies": {
    "volto-multipart-upload": "*"
}
```

Download and install the new add-on by running:

```
yarn install
```

Start volto with:

```
yarn start
```

## Test installation

Visit http://localhost:3000/ in a browser, login, and check the awesome new features.


## Development

The development of this add-on is done in isolation using a new approach using pnpm workspaces and latest `mrs-developer` and other Volto core improvements.
For this reason, it only works with pnpm and Volto 18 (currently in alpha).


### Prerequisites ✅

-   An [operating system](https://6.docs.plone.org/install/create-project-cookieplone.html#prerequisites-for-installation) that runs all the requirements mentioned.
-   [nvm](https://6.docs.plone.org/install/create-project-cookieplone.html#nvm)
-   [Node.js and pnpm](https://6.docs.plone.org/install/create-project.html#node-js) 24
-   [Make](https://6.docs.plone.org/install/create-project-cookieplone.html#make)
-   [Git](https://6.docs.plone.org/install/create-project-cookieplone.html#git)
-   [Docker](https://docs.docker.com/get-started/get-docker/) (optional)

### Installation 🔧

1.  Clone this repository, then change your working directory.

    ```shell
    git clone git@github.com:collective/volto-multipart-upload.git
    cd volto-multipart-upload
    ```

2.  Install this code base.

    ```shell
    make install
    ```


### Make convenience commands

Run `make help` to list the available commands.

```text
help                             Show this help
install                          Installs the add-on in a development environment
start                            Starts Volto, allowing reloading of the add-on during development
build                            Build a production bundle for distribution of the project with the add-on
i18n                             Sync i18n
ci-i18n                          Check if i18n is not synced
format                           Format codebase
lint                             Lint, or catch and remove problems, in code base
release                          Release the add-on on npmjs.org
release-dry-run                  Dry-run the release of the add-on on npmjs.org
test                             Run unit tests
ci-test                          Run unit tests in CI
backend-docker-start             Starts a Docker-based backend for development
storybook-start                  Start Storybook server on port 6006
storybook-build                  Build Storybook
acceptance-frontend-dev-start    Start acceptance frontend in development mode
acceptance-frontend-prod-start   Start acceptance frontend in production mode
acceptance-backend-start         Start backend acceptance server
ci-acceptance-backend-start      Start backend acceptance server in headless mode for CI
acceptance-test                  Start Cypress in interactive mode
ci-acceptance-test               Run cypress tests in headless mode for CI
```

### Development environment set up

Install package requirements.

```shell
make install
```

### Start developing

Start the backend.

```shell
make backend-docker-start
```

In a separate terminal session, start the frontend.

```shell
make start
```

### Lint code

Run ESlint, Prettier, and Stylelint in analyze mode.

```shell
make lint
```

### Format code

Run ESlint, Prettier, and Stylelint in fix mode.

```shell
make format
```

### i18n

Extract the i18n messages to locales.

```shell
make i18n
```

### Unit tests

Run unit tests.

```shell
make test
```

### Run Cypress tests

Run each of these steps in separate terminal sessions.

In the first session, start the frontend in development mode.

```shell
make acceptance-frontend-dev-start
```

In the second session, start the backend acceptance server.

```shell
make acceptance-backend-start
```

In the third session, start the Cypress interactive test runner.

```shell
make acceptance-test
```

## License

The project is licensed under the MIT license.

## Credits and acknowledgements 🙏

Generated using [Cookieplone (1.0.0)](https://github.com/plone/cookieplone) and [cookieplone-templates (103d811)](https://github.com/plone/cookieplone-templates/commit/103d811612845aa22b1096890801c7bddd8615fb) on 2026-06-15 00:38:28.247480. A special thanks to all contributors and supporters!
