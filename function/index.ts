interface CroudFrontRequest {
  uri: string;
}

interface CloudFrontRequestEvent {
  request: CroudFrontRequest;
}
function handler(event: CloudFrontRequestEvent) {
  // eslint-disable-next-line no-var
  var { request } = event;
  // eslint-disable-next-line no-var
  var { uri } = request;

  // Check whether the URI is missing a file name.
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  }
  // Check whether the URI is missing a file extension.
  else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }

  return request;
}
