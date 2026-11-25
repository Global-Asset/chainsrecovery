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

    const res = await fetch(url, config);
    
    let data;
    try {
        data = await res.json();
    } catch (e) {
        throw new Error(`Server crashed (Status ${res.status}). Check Render Logs!`);
    }

    if (res.status === 401 || res.status === 403) {
        Tokens.clearAdmin();
        throw new Error('Session expired or invalid token.');
    }

    if (!res.ok) {
        // This will show the REAL error from the backend (e.g., "Failed to load users")
        throw new Error(data.error || 'Unknown server error');
    }
    
    return data;
}
