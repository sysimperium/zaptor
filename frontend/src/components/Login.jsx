import React, { useState, useEffect } from 'react';
import { LogIn, MessageCircle, Lock, User, AlertTriangle, Server } from 'lucide-react';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Backend URL configuration
    const [backendUrl, setBackendUrl] = useState(() => {
        return localStorage.getItem('zapptor_backend_url') || 'http://localhost:3001';
    });
    const [backendConnected, setBackendConnected] = useState(false);
    const [checkingConnection, setCheckingConnection] = useState(true);

    const checkConnection = async (url) => {
        setCheckingConnection(true);
        setError('');
        try {
            const res = await fetch(`${url}/api/status`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'online') {
                    setBackendConnected(true);
                    localStorage.setItem('zapptor_backend_url', url);
                } else {
                    throw new Error('Servidor respondeu, mas status não é online.');
                }
            } else {
                throw new Error(`Servidor offline (Status ${res.status})`);
            }
        } catch (err) {
            setBackendConnected(false);
            setError('Não foi possível conectar ao servidor backend. Verifique se o Docker está rodando e a URL está correta.');
        } finally {
            setCheckingConnection(false);
        }
    };

    useEffect(() => {
        checkConnection(backendUrl);
    }, []);

    const handleSaveBackendUrl = (e) => {
        e.preventDefault();
        // Clean URL trailing slash if exists
        const formattedUrl = backendUrl.replace(/\/$/, '');
        localStorage.setItem('zapptor_backend_url', formattedUrl);
        window.location.reload();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) return;

        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${backendUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username.trim(),
                    password: password.trim(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro ao fazer login. Tente novamente.');
            }

            onLogin(data.token, data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (checkingConnection) {
        return (
            <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mb-4"></div>
                <p className="text-gray-500 font-medium">Verificando conexão com o backend...</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-500 hover:scale-102 border border-gray-100">
            <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                    <div className="bg-green-100 text-green-600 p-4 rounded-full shadow-inner">
                        <MessageCircle size={40} className="animate-pulse" />
                    </div>
                </div>
                <h1 className="text-3xl font-extrabold text-gray-800 mb-2 tracking-tight">ZappTor Intranet</h1>
                <p className="text-gray-500 font-medium">Controle de Mensalidades & Multi-Tenant</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-start space-x-3 text-red-700 text-sm">
                    <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {!backendConnected ? (
                <form onSubmit={handleSaveBackendUrl} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2 text-center text-red-500 font-bold">
                            ⚠️ Servidor não encontrado
                        </label>
                        <p className="text-xs text-gray-500 text-center mb-4">
                            Insira a URL correta do backend local (Docker/Railway):
                        </p>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                                <Server size={18} />
                            </span>
                            <input
                                type="text"
                                value={backendUrl}
                                onChange={(e) => setBackendUrl(e.target.value)}
                                placeholder="http://localhost:3001"
                                className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-green-100 focus:border-green-500 outline-none transition-all duration-300 text-gray-800 font-medium"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all duration-300 shadow-lg"
                    >
                        <span>Salvar e Conectar</span>
                    </button>
                </form>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
                            Usuário
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                                <User size={18} />
                            </span>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Ex: joao_vendas"
                                className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-green-100 focus:border-green-500 outline-none transition-all duration-300 text-gray-800 font-medium"
                                required
                                disabled={loading}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                            Senha
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                                <Lock size={18} />
                            </span>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-4 focus:ring-green-100 focus:border-green-500 outline-none transition-all duration-300 text-gray-800 font-medium"
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                        <button 
                            type="button" 
                            onClick={() => setBackendConnected(false)}
                            className="text-gray-400 hover:text-green-600 transition"
                        >
                            ⚙️ Configurar Servidor
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !username.trim() || !password.trim()}
                        className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all duration-300 focus:ring-4 focus:ring-green-200 shadow-lg hover:shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {loading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                            <>
                                <span>Entrar no Sistema</span>
                                <LogIn size={20} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>
            )}
        </div>
    );
};

export default Login;
