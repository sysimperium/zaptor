import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';
import RootPanel from './components/RootPanel';

function App() {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Auto updater states
    const [updateInfo, setUpdateInfo] = useState(null);
    const [showUpdater, setShowUpdater] = useState(false);
    const [updateState, setUpdateState] = useState({ status: 'idle', progress: 0, error: null });

    useEffect(() => {
        const savedToken = localStorage.getItem('zapptor_token');
        const savedUser = localStorage.getItem('zapptor_user');
        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (user && (user.role === 'root' || user.role === 'admin')) {
            checkSystemVersion();
        }
    }, [user]);

    const checkSystemVersion = async () => {
        try {
            // Get local version
            const localRes = await fetch('/api/system/version', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!localRes.ok) return;
            const { version: localVersion } = await localRes.json();

            // Get latest remote version from GitHub
            const remoteRes = await fetch('https://api.github.com/repos/sysimperium/zaptor/releases/latest');
            if (!remoteRes.ok) return;
            const remoteData = await remoteRes.json();
            
            const remoteVersion = remoteData.tag_name.replace(/^v/, '');
            
            // Simple semver comparison (v1 < v2)
            const isNewer = compareVersions(remoteVersion, localVersion);
            
            if (isNewer) {
                const tarAsset = remoteData.assets.find(a => a.name === 'zapping-backend.tar');
                if (tarAsset) {
                    setUpdateInfo({
                        current: localVersion,
                        latest: remoteVersion,
                        downloadUrl: tarAsset.browser_download_url,
                        changelog: remoteData.body
                    });
                }
            }
        } catch (err) {
            console.error('Erro ao verificar versão do sistema:', err);
        }
    };

    const compareVersions = (vRemote, vLocal) => {
        const partsRemote = vRemote.split('.').map(Number);
        const partsLocal = vLocal.split('.').map(Number);
        for (let i = 0; i < Math.max(partsRemote.length, partsLocal.length); i++) {
            const r = partsRemote[i] || 0;
            const l = partsLocal[i] || 0;
            if (r > l) return true;
            if (r < l) return false;
        }
        return false;
    };

    const triggerUpdate = async () => {
        if (!updateInfo) return;
        try {
            setUpdateState({ status: 'starting', progress: 0, error: null });
            
            const res = await fetch('/api/system/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ downloadUrl: updateInfo.downloadUrl })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Erro ao iniciar atualização');
            }

            // Start polling status
            pollUpdateStatus();
        } catch (err) {
            setUpdateState({ status: 'failed', progress: 0, error: err.message });
        }
    };

    const pollUpdateStatus = () => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/system/update/status', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) return;
                const statusData = await res.json();
                
                setUpdateState(statusData);

                if (statusData.status === 'failed') {
                    clearInterval(interval);
                } else if (statusData.status === 'restarting') {
                    clearInterval(interval);
                    // Wait for backend to recover
                    waitForServerRestart();
                }
            } catch (err) {
                console.warn('Servidor reiniciando ou indisponível temporariamente...');
            }
        }, 1000);
    };

    const waitForServerRestart = () => {
        setUpdateState({ status: 'restarting', progress: 100, error: null });
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/system/version');
                if (res.ok) {
                    clearInterval(interval);
                    setUpdateState({ status: 'success', progress: 100, error: null });
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                }
            } catch (err) {
                // Keep waiting for offline server to reboot
            }
        }, 2000);
    };

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
        <div className="min-h-screen flex items-center justify-center font-sans relative" style={{ backgroundColor: '#eae6df' }}>
            {!user ? (
                <Login onLogin={handleLogin} />
            ) : user.role === 'root' ? (
                <RootPanel token={token} user={user} onLogout={handleLogout} />
            ) : (
                <Chat token={token} user={user} onLogout={handleLogout} />
            )}

            {/* Notification Toast */}
            {updateInfo && !showUpdater && (
                <div className="fixed top-4 right-4 z-40 bg-white shadow-2xl border-l-4 border-green-500 rounded-xl p-4 flex items-center space-x-3 max-w-sm animate-pulse">
                    <div className="text-green-500 text-xl">🔔</div>
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-800">Atualização Disponível</h4>
                        <p className="text-xs text-gray-500">Nova versão v{updateInfo.latest} pronta para instalar.</p>
                    </div>
                    <button 
                        onClick={() => setShowUpdater(true)}
                        className="px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 transition"
                    >
                        Atualizar
                    </button>
                </div>
            )}

            {/* Interactive Update Modal */}
            {showUpdater && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-100 flex flex-col">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Atualização do Sistema</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Nova versão <span className="font-semibold text-green-600">v{updateInfo.latest}</span> (versão atual: v{updateInfo.current}).
                        </p>
                        
                        {updateState.status === 'idle' && (
                            <>
                                <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 mb-6 max-h-40 overflow-y-auto">
                                    <h4 className="font-semibold text-gray-700 mb-1">Novidades da versão:</h4>
                                    <div className="whitespace-pre-line">{updateInfo.changelog || 'Nenhuma nota de versão fornecida.'}</div>
                                </div>
                                
                                <div className="flex space-x-3 justify-end">
                                    <button 
                                        onClick={() => setShowUpdater(false)}
                                        className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                                    >
                                        Depois
                                    </button>
                                    <button 
                                        onClick={triggerUpdate}
                                        className="px-5 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-semibold"
                                    >
                                        Atualizar Agora
                                    </button>
                                </div>
                            </>
                        )}

                        {updateState.status !== 'idle' && updateState.status !== 'failed' && updateState.status !== 'success' && (
                            <div className="flex flex-col items-center py-6">
                                <div className="relative w-24 h-24 flex items-center justify-center mb-4">
                                    <div className="absolute inset-0 rounded-full border-4 border-gray-100"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin"></div>
                                    <span className="text-xl font-bold text-gray-700">
                                        {updateState.status === 'downloading' ? `${updateState.progress}%` : '...'}
                                    </span>
                                </div>
                                <p className="text-base font-semibold text-gray-700">
                                    {updateState.status === 'starting' && 'Iniciando processo...'}
                                    {updateState.status === 'downloading' && `Baixando arquivos (${updateState.progress}%)`}
                                    {updateState.status === 'loading_image' && 'Carregando Docker Image...'}
                                    {updateState.status === 'restarting' && 'Reiniciando o servidor local...'}
                                </p>
                                <p className="text-xs text-gray-400 mt-2 text-center">
                                    Este processo pode levar de 1 a 2 minutos. Não recarregue a página.
                                </p>
                            </div>
                        )}

                        {updateState.status === 'failed' && (
                            <div className="flex flex-col items-center py-4">
                                <div className="text-red-500 text-5xl mb-3">❌</div>
                                <p className="text-lg font-bold text-gray-800">Falha na Atualização</p>
                                <p className="text-sm text-red-500 text-center mt-2">{updateState.error}</p>
                                <button 
                                    onClick={() => setUpdateState({ status: 'idle', progress: 0, error: null })}
                                    className="mt-6 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition"
                                >
                                    Tentar Novamente
                                </button>
                            </div>
                        )}

                        {updateState.status === 'success' && (
                            <div className="flex flex-col items-center py-6 text-center">
                                <div className="text-green-500 text-5xl mb-3 animate-bounce">✅</div>
                                <p className="text-xl font-bold text-gray-800">Sucesso!</p>
                                <p className="text-sm text-gray-500 mt-2">
                                    O sistema foi atualizado para a versão <span className="font-semibold text-green-600">v{updateInfo.latest}</span>. Recarregando...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
