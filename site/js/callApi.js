let backendServerUrl = 'http://localhost:8080';
let feUrl = 'http://localhost:8000';
if (location.origin.indexOf('https://communityrecs.codingvibe.dev') > -1) {
  backendServerUrl = 'https://communityrecsapi.codingvibe.dev';
  feUrl = 'https://communityrecs.codingvibe.dev';
}

export async function callBackend(path, options = {}) {
  const method = options.method || 'GET'
  const body = options.body ? JSON.stringify(options.body) : null
  const skipParse = options.skipParse || false;
  return fetch(`${backendServerUrl}${path}`, { 
      method: method,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: body
    }).then(async (res) => {
      if (res.status == 401) {
        window.location.assign("/");
        return;
      }
      if (skipParse) {
        return;
      }
      const body = await res.json();
      if (res.status > 399) {
        throw {
          error: res.status,
          body: body
        }
      }
      return body;
    });
}

export function getFrontendUrl() {
  return feUrl;
}