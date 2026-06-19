import React, { useState, useEffect } from 'react';
import { Building2, Users, Plus, Trash2, Calendar, Power, LogOut, Key, ShieldAlert, DollarSign, CheckCircle, Clock, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';

const RootPanel = ({ token, user, onLogout }) => {
    const [activeTab, setActiveTab] = useState('tenants'); // tenants, users
    const [tenants, setTenants] = useState([]);
    const [systemUsers, setSystemUsers] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form states for Tenants
    const [newTenantName, setNewTenantName] = useState('');
    const [newTenantExpiry, setNewTenantExpiry] = useState('');
    const [newTenantPlan, setNewTenantPlan] = useState('free');
    const [rootPixKey, setRootPixKey] = useState('');
    const [selectedFilterTenantId, setSelectedFilterTenantId] = useState('all');

    // Form states for Users
    const [newUserName, setNewUserName] = useState('');
    const [newUserUsername, setNewUserUsername] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('admin');
    const [newUserTenantId, setNewUserTenantId] = useState('');

    // Editing states
    const [editingTenant, setEditingTenant] = useState(null);
    const [editingUser, setEditingUser] = useState(null);

    // Payments states
    const [selectedTenantPayments, setSelectedTenantPayments] = useState(null); // tenant object
    const [tenantPaymentsList, setTenantPaymentsList] = useState([]);
    const [newPaymentAmount, setNewPaymentAmount] = useState('150.00');
    const [newPaymentDate, setNewPaymentDate] = useState('');

    const SERVER_URL = localStorage.getItem('zapptor_backend_url') || (window.location.port === '5173'
        ? `http://${window.location.hostname}:3001`
        : `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`);

    const fetchData = async () => {
        try {
            setError('');
            // Fetch Tenants
            const tenantsRes = await fetch(`${SERVER_URL}/api/root/tenants`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const tenantsData = await tenantsRes.json();
            if (tenantsRes.ok) setTenants(tenantsData);

            // Fetch Users
            const usersRes = await fetch(`${SERVER_URL}/api/root/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const usersData = await usersRes.json();
            if (usersRes.ok) setSystemUsers(usersData);

            // Fetch PIX key setting
            const pixRes = await fetch(`${SERVER_URL}/api/settings/root_pix_key`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pixData = await pixRes.json();
            if (pixRes.ok) setRootPixKey(pixData.value || '');
        } catch (err) {
            setError('Erro ao carregar dados do servidor.');
        }
    };

    const handleSavePixKey = async () => {
        try {
            setError('');
            setSuccess('');
            const res = await fetch(`${SERVER_URL}/api/settings/root_pix_key`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ value: rootPixKey.trim() })
            });
            if (res.ok) {
                setSuccess('Chave PIX do Root atualizada com sucesso!');
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao salvar chave PIX.');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleCreateTenant = async (e) => {
        e.preventDefault();
        if (!newTenantName.trim() || !newTenantExpiry) return;

        setError('');
        setSuccess('');

        try {
            const expiryISO = new Date(newTenantExpiry).toISOString();
            
            if (editingTenant) {
                const res = await fetch(`${SERVER_URL}/api/root/tenants/${editingTenant.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newTenantName.trim(), expires_at: expiryISO, plan: newTenantPlan })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erro ao editar empresa.');
                setSuccess(`Empresa "${newTenantName}" atualizada!`);
                setEditingTenant(null);
            } else {
                const res = await fetch(`${SERVER_URL}/api/root/tenants`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newTenantName.trim(), expires_at: expiryISO, plan: newTenantPlan })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erro ao criar empresa.');
                setSuccess(`Empresa "${newTenantName}" criada com sucesso!`);
            }

            setNewTenantName('');
            setNewTenantExpiry('');
            setNewTenantPlan('free');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEditTenantClick = (tenant) => {
        setEditingTenant(tenant);
        setNewTenantName(tenant.name);
        setNewTenantExpiry(tenant.expires_at.split('T')[0]);
        setNewTenantPlan(tenant.plan || 'free');
        setActiveTab('tenants');
        setSelectedTenantPayments(null);
    };

    const handleToggleTenantStatus = async (id, currentStatus) => {
        setError('');
        setSuccess('');
        const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
        try {
            const res = await fetch(`${SERVER_URL}/api/root/tenants/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: nextStatus })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao alterar status.');
            }
            setSuccess('Status da empresa atualizado.');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteTenant = async (id, name) => {
        if (!window.confirm(`Tem certeza de que deseja excluir permanentemente a empresa "${name}"?`)) return;

        setError('');
        setSuccess('');

        try {
            const res = await fetch(`${SERVER_URL}/api/root/tenants/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Erro ao excluir empresa.');
            }
            setSuccess('Empresa excluída com sucesso.');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUserName.trim() || !newUserUsername.trim() || (editingUser ? false : !newUserPassword.trim()) || (newUserRole !== 'root' && !newUserTenantId)) return;

        setError('');
        setSuccess('');

        try {
            const body = {
                name: newUserName.trim(),
                username: newUserUsername.trim(),
                role: newUserRole,
                tenantId: newUserRole === 'root' ? null : Number(newUserTenantId)
            };
            if (newUserPassword.trim()) body.password = newUserPassword.trim();

            if (editingUser) {
                const res = await fetch(`${SERVER_URL}/api/root/users/${editingUser.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erro ao editar usuário.');
                setSuccess(`Usuário "${newUserUsername}" atualizado!`);
                setEditingUser(null);
            } else {
                const res = await fetch(`${SERVER_URL}/api/root/users`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar usuário.');
                setSuccess(`Usuário "${newUserUsername}" cadastrado com sucesso!`);
            }

            setNewUserName('');
            setNewUserUsername('');
            setNewUserPassword('');
            setNewUserTenantId('');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEditUserClick = (u) => {
        setEditingUser(u);
        setNewUserName(u.name);
        setNewUserUsername(u.username);
        setNewUserPassword('');
        setNewUserRole(u.role);
        setNewUserTenantId(u.tenant_id || '');
        setActiveTab('users');
    };

    const handleDeleteUser = async (u) => {
        if (!window.confirm(`Excluir usuário "${u.username}"?`)) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/root/users/${u.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir usuário.');
            setSuccess('Usuário excluído.');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    // Payments Logic
    const fetchPayments = async (tenant) => {
        setSelectedTenantPayments(tenant);
        try {
            const res = await fetch(`${SERVER_URL}/api/root/tenants/${tenant.id}/payments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) setTenantPaymentsList(data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreatePayment = async (e) => {
        e.preventDefault();
        if (!selectedTenantPayments || !newPaymentAmount || !newPaymentDate) return;

        try {
            const res = await fetch(`${SERVER_URL}/api/root/tenants/${selectedTenantPayments.id}/payments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount: newPaymentAmount, due_date: newPaymentDate })
            });
            if (res.ok) {
                fetchPayments(selectedTenantPayments);
                setNewPaymentDate('');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handlePayPayment = async (id) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/root/payments/${id}/pay`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchPayments(selectedTenantPayments);
                fetchData(); // Update tenant list (expiry date)
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeletePayment = async (id) => {
        if (!window.confirm('Excluir esta mensalidade?')) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/root/payments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchPayments(selectedTenantPayments);
        } catch (err) {
            console.error(err);
        }
    };

    // Format ISO string to readable localized date
    const formatDate = (isoStr) => {
        if (!isoStr) return '-';
        try {
            const date = new Date(isoStr);
            return date.toLocaleDateString('pt-BR');
        } catch (e) {
            return isoStr;
        }
    };

    const formatPlanName = (p) => {
        if (!p) return 'FREE';
        const pLower = p.toLowerCase();
        if (pLower === 'free') return 'FREE';
        if (pLower === 'mensal') return 'Mensal';
        if (pLower === 'trimestral') return 'Trimestral';
        if (pLower === 'semestral') return 'Semestral';
        if (pLower === '9meses') return '9 Meses';
        if (pLower === 'anual') return 'Anual';
        return p;
    };

    return (
        <div className="w-full max-w-6xl mx-auto h-[95vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-100">
            {/* Header */}
            <div className="bg-[#f0f2f5] px-8 py-5 flex justify-between items-center border-b border-gray-200">
                <div className="flex items-center space-x-3">
                    <div className="bg-green-600 text-white p-3 rounded-2xl shadow-md">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">ZappTor Root Panel</h1>
                        <p className="text-sm text-gray-500 font-semibold">Administração Geral do Sistema (Root)</p>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="flex items-center space-x-2 bg-white hover:bg-red-50 text-gray-700 hover:text-red-600 font-bold px-5 py-2.5 rounded-xl transition-all border border-gray-200 shadow-sm"
                >
                    <LogOut size={18} />
                    <span>Sair</span>
                </button>
            </div>

            {/* Content Tabs & Messages */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col space-y-6">
                {error && (
                    <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-center space-x-3 text-red-700 text-sm font-medium">
                        <ShieldAlert size={20} className="flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-xl flex items-center space-x-3 text-green-700 text-sm font-medium animate-fade-in">
                        <span>{success}</span>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('tenants')}
                        className={`flex items-center space-x-2 pb-4 px-6 text-base font-bold transition-all border-b-2 outline-none ${
                            activeTab === 'tenants'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Building2 size={20} />
                        <span>Gerenciar Empresas</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center space-x-2 pb-4 px-6 text-base font-bold transition-all border-b-2 outline-none ${
                            activeTab === 'users'
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Users size={20} />
                        <span>Usuários das Empresas</span>
                    </button>
                </div>

                {activeTab === 'tenants' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
                        {/* Left Column: Form or Payments list */}
                        <div className="space-y-6">
                            {/* Chave PIX do Root Configuration Card */}
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 h-fit space-y-4">
                                <h2 className="text-sm font-bold text-gray-800 flex items-center space-x-2">
                                    <DollarSign size={18} className="text-green-600" />
                                    <span>Chave PIX do Root</span>
                                </h2>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Chave PIX para Recebimento</label>
                                        <div className="flex space-x-2">
                                            <input
                                                type="text"
                                                placeholder="PIX (e-mail, celular, CNPJ, aleatória)"
                                                value={rootPixKey}
                                                onChange={(e) => setRootPixKey(e.target.value)}
                                                className="flex-1 min-w-0 px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 outline-none focus:border-green-500 bg-white"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSavePixKey}
                                                className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
                                            >
                                                Salvar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Create/Edit Tenant Form */}
                            {!selectedTenantPayments && (
                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 h-fit space-y-5">
                                    <h2 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                        {editingTenant ? <Edit2 size={20} className="text-blue-600" /> : <Plus size={20} className="text-green-600" />}
                                        <span>{editingTenant ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}</span>
                                    </h2>
                                    <form onSubmit={handleCreateTenant} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Nome da Empresa</label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Auto Car LTDA"
                                                value={newTenantName}
                                                onChange={(e) => setNewTenantName(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Plano da Empresa</label>
                                            <select
                                                value={newTenantPlan}
                                                onChange={(e) => {
                                                    const selectedPlan = e.target.value;
                                                    setNewTenantPlan(selectedPlan);
                                                    
                                                    // Automatically calculate the validation expiry date based on today + selected plan duration if not editing
                                                    if (!editingTenant) {
                                                        let days = 60; // default for free
                                                        if (selectedPlan === 'mensal') days = 30;
                                                        else if (selectedPlan === 'trimestral') days = 90;
                                                        else if (selectedPlan === 'semestral') days = 180;
                                                        else if (selectedPlan === '9meses') days = 270;
                                                        else if (selectedPlan === 'anual') days = 365;
                                                        
                                                        const d = new Date();
                                                        d.setDate(d.getDate() + days);
                                                        setNewTenantExpiry(d.toISOString().split('T')[0]);
                                                    }
                                                }}
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                            >
                                                <option value="free">Plano FREE (2 meses - R$ 0,00)</option>
                                                <option value="mensal">Plano Mensal (1 mês - R$ 25,00/mês)</option>
                                                <option value="trimestral">Plano Trimestral (3 meses - R$ 72,00)</option>
                                                <option value="semestral">Plano Semestral (6 meses - R$ 132,00)</option>
                                                <option value="9meses">Plano 9 Meses (9 meses - R$ 189,00)</option>
                                                <option value="anual">Plano Anual (12 meses - R$ 240,00)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Validade da Assinatura</label>
                                            <div className="relative">
                                                <input
                                                    type="date"
                                                    value={newTenantExpiry}
                                                    onChange={(e) => setNewTenantExpiry(e.target.value)}
                                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="flex space-x-2">
                                            <button
                                                type="submit"
                                                className={`flex-1 font-bold py-3 rounded-xl shadow-lg transition-all ${editingTenant ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/10' : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/10'}`}
                                            >
                                                {editingTenant ? 'Salvar Alterações' : 'Criar Empresa'}
                                            </button>
                                            {editingTenant && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingTenant(null); setNewTenantName(''); setNewTenantExpiry(''); setNewTenantPlan('free'); }}
                                                    className="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-all"
                                                >
                                                    Cancelar
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* Payments Management (Conditional) */}
                            {selectedTenantPayments && (
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xl space-y-5 animate-slide-in">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                            <DollarSign size={20} className="text-green-600" />
                                            <span>Mensalidades: {selectedTenantPayments.name}</span>
                                        </h2>
                                        <button onClick={() => setSelectedTenantPayments(null)} className="text-gray-400 hover:text-gray-600">
                                            <ChevronUp size={24} />
                                        </button>
                                    </div>

                                    {/* Add Payment Form */}
                                    <form onSubmit={handleCreatePayment} className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Valor</label>
                                            <input type="number" step="0.01" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm" required />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Vencimento</label>
                                            <input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 text-sm" required />
                                        </div>
                                        <button type="submit" className="col-span-2 bg-green-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-green-700 transition-colors">
                                            Gerar Nova Mensalidade
                                        </button>
                                    </form>

                                    {/* Payment List */}
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {tenantPaymentsList.length === 0 ? (
                                            <p className="text-center text-gray-400 text-sm py-4 italic">Nenhuma mensalidade gerada.</p>
                                        ) : (
                                            tenantPaymentsList.map(pay => (
                                                <div key={pay.id} className="flex justify-between items-center p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white transition-all shadow-sm hover:shadow-md">
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-800">R$ {parseFloat(pay.amount).toFixed(2)}</p>
                                                        <div className="flex items-center space-x-2 text-[10px] text-gray-500 font-bold">
                                                            <Calendar size={12} />
                                                            <span>Vence: {formatDate(pay.due_date)}</span>
                                                        </div>
                                                        {pay.status === 'paid' && (
                                                            <div className="flex items-center space-x-1 text-[9px] text-green-600 font-bold mt-0.5">
                                                                <CheckCircle size={10} />
                                                                <span>PAGO EM: {formatDate(pay.paid_at)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex space-x-2">
                                                        {pay.status === 'pending' ? (
                                                            <button 
                                                                onClick={() => handlePayPayment(pay.id)}
                                                                className="bg-green-100 hover:bg-green-500 text-green-700 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1"
                                                            >
                                                                <DollarSign size={14} />
                                                                <span>Pagar</span>
                                                            </button>
                                                        ) : (
                                                            <span className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1">
                                                                <CheckCircle size={14} />
                                                                <span>OK</span>
                                                            </span>
                                                        )}
                                                        <button onClick={() => handleDeletePayment(pay.id)} className="p-2 text-red-400 hover:text-red-600 transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tenants List */}
                        <div className="lg:col-span-2 overflow-x-auto">
                            <h2 className="text-lg font-bold text-gray-800 mb-4">Empresas Contratantes</h2>
                            {tenants.length === 0 ? (
                                <p className="text-gray-400 font-medium py-10 text-center bg-gray-50 rounded-2xl border border-dashed">Nenhuma empresa cadastrada.</p>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-200 text-gray-400 text-xs font-bold uppercase tracking-wider">
                                            <th className="py-3 px-4">Nome</th>
                                            <th className="py-3 px-4">Plano</th>
                                            <th className="py-3 px-4">Mensalidade Até</th>
                                            <th className="py-3 px-4">Status</th>
                                            <th className="py-3 px-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-700">
                                        {tenants.map((tenant) => {
                                            const isExpired = new Date(tenant.expires_at) < new Date();
                                            const isSelected = selectedTenantPayments?.id === tenant.id;
                                            return (
                                                <tr key={tenant.id} className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-green-50/50' : ''}`}>
                                                    <td className="py-4 px-4 font-bold text-gray-900">{tenant.name}</td>
                                                    <td className="py-4 px-4">
                                                        <span className="font-bold text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg">
                                                            {formatPlanName(tenant.plan)}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4 flex items-center space-x-2">
                                                        <Calendar size={15} className="text-gray-400" />
                                                        <span className={isExpired ? 'text-red-500 font-bold' : 'text-gray-600'}>
                                                            {formatDate(tenant.expires_at)} {isExpired && '(Vencida)'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                                                            tenant.status === 'active' && !isExpired
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-red-100 text-red-700'
                                                        }`}>
                                                            {tenant.status === 'active' && !isExpired ? 'Ativo' : 'Suspenso'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4 text-right space-x-2">
                                                        <button
                                                            onClick={() => handleEditTenantClick(tenant)}
                                                            className="p-2 rounded-xl bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 transition-all"
                                                            title="Editar empresa"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => fetchPayments(tenant)}
                                                            className={`p-2 rounded-xl transition-all border ${
                                                                isSelected 
                                                                ? 'bg-green-600 text-white border-green-600'
                                                                : 'bg-white hover:bg-green-50 text-green-600 border-green-100'
                                                            }`}
                                                            title="Ver/Gerar Mensalidades"
                                                        >
                                                            <DollarSign size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleTenantStatus(tenant.id, tenant.status)}
                                                            className={`p-2 rounded-xl transition-all border ${
                                                                tenant.status === 'active'
                                                                    ? 'bg-white hover:bg-yellow-50 text-yellow-600 border-yellow-100'
                                                                    : 'bg-white hover:bg-green-50 text-green-600 border-green-100'
                                                            }`}
                                                            title={tenant.status === 'active' ? 'Suspender assinatura' : 'Ativar assinatura'}
                                                        >
                                                            <Power size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                                                            className="p-2 rounded-xl bg-white hover:bg-red-50 text-red-500 border border-red-100 transition-all"
                                                            title="Excluir empresa"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
                        {/* Create User Form */}
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 h-fit space-y-5">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                {editingUser ? <Edit2 size={20} className="text-blue-600" /> : <Plus size={20} className="text-green-600" />}
                                <span>{editingUser ? 'Editar Administrador' : 'Cadastrar Administrador'}</span>
                            </h2>
                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Nome Completo</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Carlos Augusto"
                                        value={newUserName}
                                        onChange={(e) => setNewUserName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Usuário de Login</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: carlos_admin"
                                        value={newUserUsername}
                                        onChange={(e) => setNewUserUsername(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Senha {editingUser && '(Deixe em branco para manter)'}</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        value={newUserPassword}
                                        onChange={(e) => setNewUserPassword(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                        required={!editingUser}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Nível de Acesso</label>
                                    <select
                                        value={newUserRole}
                                        onChange={(e) => setNewUserRole(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                        disabled={editingUser?.role === 'root'}
                                    >
                                        <option value="admin">Administrador Geral da Empresa (Admin)</option>
                                        {editingUser?.role === 'root' && <option value="root">Root</option>}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Vincular à Empresa</label>
                                    <select
                                        value={newUserTenantId}
                                        onChange={(e) => setNewUserTenantId(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all font-medium text-gray-700 bg-white"
                                        required={newUserRole !== 'root'}
                                        disabled={newUserRole === 'root'}
                                    >
                                        <option value="">Selecione uma Empresa...</option>
                                        {tenants.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        type="submit"
                                        className={`flex-1 font-bold py-3 rounded-xl shadow-lg transition-all ${editingUser ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                                    >
                                        {editingUser ? 'Salvar Alterações' : 'Criar Usuário Admin'}
                                    </button>
                                    {editingUser && (
                                        <button
                                            type="button"
                                            onClick={() => { setEditingUser(null); setNewUserName(''); setNewUserUsername(''); setNewUserPassword(''); setNewUserTenantId(''); }}
                                            className="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-all"
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Users List */}
                        <div className="lg:col-span-2 space-y-5">
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-bold text-gray-800">Usuários do Sistema</h2>
                            </div>

                            {/* Filter selector */}
                            <div className="flex flex-wrap gap-2 p-1 bg-gray-50 rounded-2xl border border-gray-100 max-h-[120px] overflow-y-auto custom-scrollbar">
                                <button
                                    type="button"
                                    onClick={() => setSelectedFilterTenantId('all')}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                        selectedFilterTenantId === 'all'
                                            ? 'bg-green-600 text-white border-green-600 shadow-md shadow-green-500/10'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100/50'
                                    }`}
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedFilterTenantId('root')}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                        selectedFilterTenantId === 'root'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/10'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100/50'
                                    }`}
                                >
                                    Geral (Root)
                                </button>
                                {tenants.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setSelectedFilterTenantId(t.id)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                            selectedFilterTenantId === t.id
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/10'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100/50'
                                        }`}
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>

                            {systemUsers.length === 0 ? (
                                <p className="text-gray-400 font-medium py-10 text-center bg-gray-50 rounded-2xl border border-dashed">Nenhum usuário cadastrado.</p>
                            ) : (() => {
                                // Filter and Group
                                const filtered = systemUsers.filter(u => {
                                    if (selectedFilterTenantId === 'all') return true;
                                    if (selectedFilterTenantId === 'root') return u.role === 'root';
                                    return u.tenant_id === Number(selectedFilterTenantId);
                                });

                                const groups = {};
                                filtered.forEach(u => {
                                    const tenantId = u.tenant_id || 'root';
                                    const tenantName = u.tenant_name || (u.role === 'root' ? 'Administração Geral (Root)' : 'Sem Empresa');
                                    if (!groups[tenantId]) {
                                        groups[tenantId] = {
                                            id: tenantId,
                                            name: tenantName,
                                            users: []
                                        };
                                    }
                                    groups[tenantId].users.push(u);
                                });

                                const groupedArray = Object.values(groups);

                                if (groupedArray.length === 0) {
                                    return <p className="text-gray-400 font-medium py-10 text-center bg-gray-50 rounded-2xl border border-dashed">Nenhum usuário encontrado para esta seleção.</p>;
                                }

                                return (
                                    <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
                                        {groupedArray.map(group => (
                                            <div key={group.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                {/* Group Header - Click to filter directly */}
                                                <div 
                                                    onClick={() => {
                                                        if (selectedFilterTenantId === 'all') {
                                                            setSelectedFilterTenantId(group.id);
                                                        } else {
                                                            setSelectedFilterTenantId('all');
                                                        }
                                                    }}
                                                    className="bg-gray-50/70 hover:bg-gray-50 px-5 py-3 border-b border-gray-100 flex justify-between items-center cursor-pointer transition-colors"
                                                    title={selectedFilterTenantId === 'all' ? "Clique para filtrar apenas esta empresa" : "Clique para mostrar todas"}
                                                >
                                                    <span className="font-extrabold text-[11px] text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Building2 size={13} className={group.id === 'root' ? 'text-purple-600' : 'text-blue-600'} />
                                                        {group.name}
                                                    </span>
                                                    <span className="text-[10px] font-extrabold bg-gray-200/80 text-gray-600 px-2 py-0.5 rounded-full">
                                                        {group.users.length} {group.users.length === 1 ? 'usuário' : 'usuários'}
                                                    </span>
                                                </div>

                                                {/* Users Table for this group */}
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-gray-100 text-gray-400 text-[10px] font-extrabold uppercase tracking-wider bg-gray-50/10">
                                                            <th className="py-2.5 px-5">Nome</th>
                                                            <th className="py-2.5 px-5">Login</th>
                                                            <th className="py-2.5 px-5">Perfil</th>
                                                            <th className="py-2.5 px-5 text-right">Ações</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 text-xs font-semibold text-gray-700">
                                                        {group.users.map((u) => (
                                                            <tr key={u.id} className="hover:bg-gray-50/20 transition-colors">
                                                                <td className="py-3 px-5 font-bold text-gray-900">{u.name}</td>
                                                                <td className="py-3 px-5 text-gray-600 font-mono">{u.username}</td>
                                                                <td className="py-3 px-5">
                                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                                        u.role === 'root'
                                                                            ? 'bg-purple-100 text-purple-700'
                                                                            : u.role === 'admin'
                                                                            ? 'bg-blue-100 text-blue-700'
                                                                            : 'bg-gray-100 text-gray-600'
                                                                    }`}>
                                                                        {u.role}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3 px-5 text-right space-x-1">
                                                                    <button
                                                                        onClick={() => handleEditUserClick(u)}
                                                                        className="p-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 transition-all"
                                                                        title="Editar usuário"
                                                                    >
                                                                        <Edit2 size={14} />
                                                                    </button>
                                                                    {u.role !== 'root' && (
                                                                        <button
                                                                            onClick={() => handleDeleteUser(u)}
                                                                            className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-red-500 border border-red-100 transition-all"
                                                                            title="Excluir usuário"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RootPanel;
