/**
 * Shadowed from @plone/volto components/manage/Contents/ContentsUploadModal.jsx
 * (Volto 19.1.4).
 *
 * Modifications introduced by volto-multipart-upload:
 * - Replaced the base64 JSON upload (readAsDataURL + dispatch(createContent))
 *   with direct multipart/form-data uploads via `uploadFileMultipart`, passing
 *   the File objects as-is and avoiding the base64 round-trip in memory.
 * - Removed the Redux subrequest plumbing (createContent import, useDispatch
 *   subrequest selectors, usePrevious, SUBREQUEST, the useEffect watching
 *   request completion) in favour of local `uploading`/`uploadedFiles` state.
 * - `readAsDataURL` is kept only in `onDrop`, to build image previews.
 *
 * Keep this file in sync when upgrading Volto.
 */
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import {
  Button,
  Dimmer,
  Header,
  Icon,
  Modal,
  Table,
  Segment,
  Input,
  Progress,
} from 'semantic-ui-react';
import loadable from '@loadable/component';
import concat from 'lodash/concat';
import filter from 'lodash/filter';
import map from 'lodash/map';
import filesize from 'filesize';
import { readAsDataURL } from 'promise-file-reader';
import { FormattedMessage, defineMessages, useIntl } from 'react-intl';
import FormattedRelativeDate from '@plone/volto/components/theme/FormattedDate/FormattedRelativeDate';
import { validateFileUploadSize } from '@plone/volto/helpers/FormValidation/FormValidation';
import Image from '@plone/volto/components/theme/Image/Image';
import { uploadFileMultipart } from 'volto-multipart-upload/utils/multipart';

const Dropzone = loadable(() => import('react-dropzone'));

const messages = defineMessages({
  cancel: {
    id: 'Cancel',
    defaultMessage: 'Cancel',
  },
  upload: {
    id: '{count, plural, one {Upload {count} file} other {Upload {count} files}}',
    defaultMessage:
      '{count, plural, one {Upload {count} file} other {Upload {count} files}}',
  },
  filesUploaded: {
    id: 'Files uploaded: {uploadedFiles}',
    defaultMessage: 'Files uploaded: {uploadedFiles}',
  },
  totalFilesToUpload: {
    id: 'Total files to upload: {totalFiles}',
    defaultMessage: 'Total files to upload: {totalFiles}',
  },
});

const ContentsUploadModal = (props) => {
  const intl = useIntl();
  // eslint-disable-next-line no-unused-vars
  const dispatch = useDispatch(); // kept for potential future use by consumers
  const token = useSelector((state) => state.userSession.token);

  const [files, setFiles] = useState([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState(0);

  const { onOk } = props;

  // Reset counter when modal closes
  useEffect(() => {
    if (!props.open) {
      setUploadedFiles(0);
      setTotalFiles(0);
    }
  }, [props.open]);

  const onRemoveFile = (event) => {
    setFiles(
      filter(
        files,
        (file, index) =>
          index !== parseInt(event.target.getAttribute('value'), 10),
      ),
    );
    setTotalFiles(totalFiles - 1);
  };

  const onDrop = async (newFiles) => {
    const validFiles = [];
    for (let i = 0; i < newFiles.length; i++) {
      if (validateFileUploadSize(newFiles[i], intl.formatMessage)) {
        await readAsDataURL(newFiles[i]).then((data) => {
          const fields = data.match(/^data:(.*);(.*),(.*)$/);
          newFiles[i].preview = fields[0];
        });
        validFiles.push(newFiles[i]);
      }
    }
    setFiles(concat(files, validFiles));
    setTotalFiles(validFiles.length);
  };

  const onCancel = () => {
    props.onCancel();
    setFiles([]);
    setTotalFiles(0);
  };

  const onChangeFileName = (e, index) => {
    let copyOfFiles = [...files];
    let originalFile = files[index];
    let newFile = new File([originalFile], e.target.value, {
      type: originalFile.type,
    });
    newFile.preview = originalFile.preview;
    newFile.path = e.target.value;
    copyOfFiles[index] = newFile;
    setFiles(copyOfFiles);
  };

  const onSubmit = async () => {
    setUploading(true);
    setUploadedFiles(0);
    setTotalFiles(files.length);

    let uploaded = 0;
    try {
      await Promise.all(
        files.map(async (file) => {
          await uploadFileMultipart({
            path: props.pathname,
            file,
            title: file.name,
            token,
          });
          uploaded += 1;
          setUploadedFiles(uploaded);
        }),
      );
      onOk();
      setFiles([]);
    } catch {
      // individual errors are silently skipped; successful ones still counted
    } finally {
      setUploading(false);
    }
  };

  const {
    multiple = true,
    minSize = null,
    maxSize = null,
    accept = null,
    disabled = false,
  } = props;
  const dropzoneOptions = {
    multiple,
    minSize,
    maxSize,
    accept,
    disabled,
  };

  return (
    props.open && (
      <Modal className="contents-upload-modal" open={props.open}>
        <Header>
          <FormattedMessage id="Upload files" defaultMessage="Upload files" />
        </Header>
        <Dimmer active={uploading}>
          <div className="progress-container">
            <Progress
              className="progress-bar"
              value={uploadedFiles}
              total={totalFiles}
            >
              {intl.formatMessage(messages.filesUploaded, {
                uploadedFiles,
              })}
              <br />
              {intl.formatMessage(messages.totalFilesToUpload, {
                totalFiles,
              })}
            </Progress>
          </div>
        </Dimmer>
        <Modal.Content>
          <Dropzone
            onDrop={onDrop}
            className="dropzone"
            noDragEventsBubbling={true}
            {...dropzoneOptions}
          >
            {({ getRootProps, getInputProps }) => (
              <div {...getRootProps({ className: 'dashed' })}>
                <Segment>
                  <Table basic="very">
                    <Table.Body>
                      <Table.Row>
                        <Table.Cell>
                          <FormattedMessage
                            id="Drag and drop files from your computer onto this area or click the “Browse” button."
                            defaultMessage="Drag and drop files from your computer onto this area or click the “Browse” button."
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Button className="ui button primary">
                            <FormattedMessage
                              id="Browse"
                              defaultMessage="Browse"
                            />
                          </Button>
                          <input
                            {...getInputProps({
                              type: 'file',
                              style: { display: 'none' },
                            })}
                          />
                        </Table.Cell>
                      </Table.Row>
                    </Table.Body>
                  </Table>
                </Segment>
              </div>
            )}
          </Dropzone>
          {files.length > 0 && (
            <Table compact singleLine>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell width={8}>
                    <FormattedMessage id="Filename" defaultMessage="Filename" />
                  </Table.HeaderCell>
                  <Table.HeaderCell width={4}>
                    <FormattedMessage
                      id="Last modified"
                      defaultMessage="Last modified"
                    />
                  </Table.HeaderCell>
                  <Table.HeaderCell width={4}>
                    <FormattedMessage
                      id="File size"
                      defaultMessage="File size"
                    />
                  </Table.HeaderCell>
                  <Table.HeaderCell width={4}>
                    <FormattedMessage id="Preview" defaultMessage="Preview" />
                  </Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {map(files, (file, index) => (
                  <Table.Row className="upload-row" key={index}>
                    <Table.Cell>
                      <Input
                        className="file-name"
                        value={file.name}
                        onChange={(e) => onChangeFileName(e, index)}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      {file.lastModifiedDate && (
                        <FormattedRelativeDate date={file.lastModifiedDate} />
                      )}
                    </Table.Cell>
                    <Table.Cell>{filesize(file.size, { round: 0 })}</Table.Cell>
                    <Table.Cell>
                      {file.type.split('/')[0] === 'image' && (
                        <Image
                          src={file.preview}
                          height={60}
                          className="ui image"
                        />
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Icon
                        name="close"
                        value={index}
                        link
                        onClick={onRemoveFile}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Modal.Content>
        <Modal.Actions>
          {files.length > 0 && (
            <Button
              basic
              circular
              primary
              floated="right"
              icon="arrow right"
              aria-label={intl.formatMessage(messages.upload, {
                count: files.length,
              })}
              onClick={onSubmit}
              title={intl.formatMessage(messages.upload, {
                count: files.length,
              })}
              size="big"
            />
          )}
          <Button
            basic
            circular
            secondary
            icon="remove"
            aria-label={intl.formatMessage(messages.cancel)}
            title={intl.formatMessage(messages.cancel)}
            floated="right"
            size="big"
            onClick={onCancel}
          />
        </Modal.Actions>
      </Modal>
    )
  );
};

ContentsUploadModal.propTypes = {
  pathname: PropTypes.string.isRequired,
  open: PropTypes.bool.isRequired,
  onOk: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  multiple: PropTypes.bool,
  minSize: PropTypes.number,
  maxSize: PropTypes.number,
  accept: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.arrayOf(PropTypes.string),
  ]),
};

export default ContentsUploadModal;
