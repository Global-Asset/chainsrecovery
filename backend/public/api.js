const API_BASE = ''; // Empty because the frontend and backend are on the same server!

const Tokens = {
  getUser: () => localStorage.getItem('cr_token'),
    setUser: t => localStorage.setItem('cr_token', t),
      clearUser: () => localStorage.removeItem('cr_token'),
        getAdmin: () => sessionStorage.getItem('cr_admin_token'),
          setAdmin: t => sessionStorage.setItem('cr_admin_token', t),
            clearAdmin: () => sessionStorage.removeItem('cr_admin_token')
            };

            async function api(path, { method = 'GET', body, auth } = {}) {
              const headers = { 'Content-Type': 'application/json' };
                if (auth === 'user' && Tokens.getUser()) headers.Authorization = 'Bearer ' + Tokens.getUser();
                  if (auth === 'admin' && Tokens.getAdmin()) headers.Authorization = 'Bearer ' + Tokens.getAdmin();

                    const res = await fetch(API_BASE + path, {
                        method, headers, body: body ? JSON.stringify(body) : undefined
                          });
                            const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data.error || 'Request failed');
                                return data;
                                }