// public/api.js

const Tokens = {
    setAdmin: (token) => sessionStorage.setItem('admin_token_session', token),
    getAdmin: () => sessionStorage.getItem('admin_token_session'),
    clearAdmin: () => sessionStorage.removeItem('admin_token_session')
};

async function api(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    // Attach the Admin Token automatically if requested
    if (options.auth === 'admin') {
        const token = Tokens.getAdmin();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const config = {
        method: options.method || 'GET',
        headers: headers,
    };

    if (options.body) {
        config.body = JSON.stringify(options.body);
    }

    try {
        const res = await fetch(url, config);
        
        // If token is expired, kick them to login
        if (res.status === 401 || res.status === 403) {
            Tokens.clearAdmin();
            window.location.reload();
            throw new Error('Session expired. Please log in again.');
        }

        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Something went wrong');
        }
        
        return data;
    } catch (err) {
        throw err;
    }
}
