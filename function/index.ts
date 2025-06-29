interface CroudFrontRequest {
  uri: string;
}

interface CloudFrontRequestEvent {
  request: CroudFrontRequest;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handler(event: CloudFrontRequestEvent) {
  const request = event.request;
  const uri = request.uri;

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
