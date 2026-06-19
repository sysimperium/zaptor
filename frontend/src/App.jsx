import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';
import RootPanel from './components/RootPanel';

function App() {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedToken = localStorage.getItem('zapptor_token');
        const savedUser = localStorage.getItem('zapptor_user');
        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const handleLogin = (tokenData, userData) => {
        setToken(tokenData);
        setUser(userData);
        localStorage.setItem('zapptor_token', tokenData);
        localStorage.setItem('zapptor_user', JSON.stringify(userData));
    };

    const handleLogout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('zapptor_token');
        localStorage.removeItem('zapptor_user');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center font-sans" style={{ backgroundColor: '#eae6df' }}>
            {!user ? (
                <Login onLogin={handleLogin} />
            ) : user.role === 'root' ? (
                <RootPanel token={token} user={user} onLogout={handleLogout} />
            ) : (
                <Chat token={token} user={user} onLogout={handleLogout} />
            )}
        </div>
    );
}

export default App;
