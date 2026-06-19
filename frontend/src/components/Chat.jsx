import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
    Send, LogOut, CheckCircle2, AlertCircle, Phone, Search, MoreVertical,
    Paperclip, X, EyeOff, Edit2, Check, QrCode, Users, MessageSquare, Trash2, Plus, UserPlus,
    Smile, Mic, Video, PhoneCall, CornerUpLeft, Pin, CreditCard, DollarSign
} from 'lucide-react';
import classNames from 'classnames';

const SERVER_URL = localStorage.getItem('zapptor_backend_url') || (window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`);

const ChatAvatar = ({ chatId, name, token }) => {
    const [picUrl, setPicUrl] = useState(null);
    useEffect(() => {
        let active = true;
        if (!chatId || !token) return;
        setPicUrl(null); // Clear previous avatar on contact change
        fetch(`${SERVER_URL}/api/contacts/${encodeURIComponent(chatId)}/profile-pic`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (active) {
                    if (data.profilePicUrl) {
                        setPicUrl(data.profilePicUrl);
                    } else {
                        setPicUrl(null);
                    }
                }
            })
            .catch((err) => {
                console.error(err);
                if (active) setPicUrl(null);
            });
        return () => {
            active = false;
        };
    }, [chatId, token]);

    if (picUrl) {
        return <img src={picUrl} alt={name || 'Avatar'} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setPicUrl(null)} />;
    }

    const getInitials = (n) => n ? n.substring(0, 2).toUpperCase() : '?';
    return <div className="w-full h-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white font-bold">{getInitials(name)}</div>;
};

const formatWhatsAppNumber = (whatsappId) => {
    if (!whatsappId) return '';
    const cleanNumber = whatsappId.split('@')[0];
    
    // Check if it's a Brazilian number (starts with 55)
    if (cleanNumber.startsWith('55') && (cleanNumber.length >= 10 && cleanNumber.length <= 13)) {
        const ddd = cleanNumber.substring(2, 4);
        let numPart = cleanNumber.substring(4);
        
        // Brazilian mobile numbers should have 9 digits.
        // If the number has 8 digits and starts with 6, 7, 8, or 9, format it with a leading 9.
        if (numPart.length === 8 && ['6', '7', '8', '9'].includes(numPart[0])) {
            numPart = '9' + numPart;
        }
        
        if (numPart.length === 9) {
            return `+55 (${ddd}) ${numPart.substring(0, 5)}-${numPart.substring(5)}`;
        } else {
            return `+55 (${ddd}) ${numPart.substring(0, 4)}-${numPart.substring(4)}`;
        }
    }
    
    return `+${cleanNumber}`;
};

const getDateSeparatorText = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1, d2) => 
        d1.getDate() === d2.getDate() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getFullYear() === d2.getFullYear();

    if (isSameDay(date, today)) {
        return 'Hoje';
    } else if (isSameDay(date, yesterday)) {
        return 'Ontem';
    } else {
        return date.toLocaleDateString('pt-BR');
    }
};

const MessageStatus = ({ ack }) => {
    if (ack === 1) {
        return (
            <svg viewBox="0 0 16 15" width="16" height="15" className="text-gray-400 fill-current inline-block" style={{ verticalAlign: 'middle' }}>
                <path d="M15.01 3.3L6.18 12.13l-4.19-4.19L.9 9.03l5.28 5.28 9.92-9.92z"/>
            </svg>
        );
    }
    
    if (ack >= 2) {
        const isRead = ack >= 3;
        const tickColor = isRead ? "#53bdeb" : "#9ca3af";
        return (
            <svg viewBox="0 0 16 15" width="16" height="15" className="inline-block" style={{ fill: tickColor, verticalAlign: 'middle' }}>
                <path d="M15.01 3.3L6.18 12.13l-3.55-3.55 1.09-1.09 2.46 2.46 7.74-7.74L15.01 3.3zm-4.8 0L9.12 2.21 4.19 7.13 5.28 8.22l4.93-4.92z"/>
                <path d="M0 7.94l1.09-1.09 3.1 3.11-1.09 1.09z"/>
            </svg>
        );
    }
    
    return (
        <svg viewBox="0 0 16 16" width="12" height="12" className="text-gray-400 fill-current inline-block" style={{ verticalAlign: 'middle' }}>
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm.5-9h-1v5l4.25 2.5.5-.83-3.75-2.22V5z"/>
        </svg>
    );
};

const MediaMessage = ({ msgId, type, token, onPlayEnded }) => {
    const [media, setMedia] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!msgId || !token) return;
        fetch(`${SERVER_URL}/api/messages/${encodeURIComponent(msgId)}/media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (!data.error) setMedia(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [msgId, token]);

    if (loading) return <div className="text-sm italic text-gray-500 mb-1 flex items-center"><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500 mr-2"></div> Carregando mídia...</div>;
    if (!media || !media.data) return <div className="text-sm text-red-500 mb-1">Erro ao carregar mídia</div>;

    // Clean up mimeType to prevent browser errors with codecs parameter
    const cleanMime = media.mimetype ? media.mimetype.split(';')[0] : (type === 'audio' || type === 'ptt' ? 'audio/ogg' : 'application/octet-stream');
    const src = `data:${cleanMime};base64,${media.data}`;

    if (type === 'image') return <img src={src} alt="Imagem" className="max-w-[250px] md:max-w-sm rounded-md mb-2 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(src, '_blank')} />;
    if (type === 'video') return <video src={src} controls className="max-w-[250px] md:max-w-sm rounded-md mb-2" />;
    if (type === 'audio' || type === 'ptt') {
        return (
            <audio 
                id={`audio-${msgId}`}
                src={src} 
                controls 
                className="max-w-[250px] md:max-w-xs mb-2 h-10" 
                onEnded={() => onPlayEnded && onPlayEnded(msgId)}
            />
        );
    }
    return (
        <a href={src} download={media.filename || 'arquivo'} className="flex items-center space-x-2 bg-black/5 p-2 rounded-md mb-2 hover:bg-black/10 transition-colors w-full max-w-sm">
            <Paperclip size={18} className="flex-shrink-0" />
            <span className="text-sm truncate font-medium text-blue-600 underline">{media.filename || 'Documento / Arquivo'}</span>
        </a>
    );
};

const Chat = ({ user, token, onLogout }) => {
    const [activeSidebarTab, setActiveSidebarTab] = useState('chat'); // chat, whatsapp, operators
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState(user.name);

    const [isReady, setIsReady] = useState(false);
    const [qrCode, setQrCode] = useState(null);
    const [connError, setConnError] = useState(null);

    const [chats, setChats] = useState([]);
    const [messages, setMessages] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [newMessage, setNewMessage] = useState('');
    const [loadingChats, setLoadingChats] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Operators Tab states
    const [operators, setOperators] = useState([]);
    const [newOpName, setNewOpName] = useState('');
    const [newOpUsername, setNewOpUsername] = useState('');
    const [newOpPassword, setNewOpPassword] = useState('');
    const [editingOp, setEditingOp] = useState(null);
    const [opError, setOpError] = useState('');
    const [opSuccess, setOpSuccess] = useState('');

    // Auto-response Tab states
    const [autoRespFirstOfDay, setAutoRespFirstOfDay] = useState({ enabled: false, message: '' });
    const [autoRespSaving, setAutoRespSaving] = useState(false);
    const [autoRespMsg, setAutoRespMsg] = useState('');

    const [incomingCall, setIncomingCall] = useState(null);
    const [replyToMessage, setReplyToMessage] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);

    // Finance Tab states
    const [tenantInfo, setTenantInfo] = useState(null);
    const [tenantPayments, setTenantPayments] = useState([]);
    const [financeRootPixKey, setFinanceRootPixKey] = useState('');
    const [selectedPaymentForPix, setSelectedPaymentForPix] = useState(null);

    const [socket, setSocket] = useState(null);
    const messagesEndRef = useRef(null);
    const messageInputRef = useRef(null);
    const activeChatRef = useRef(null);
    const chatsRef = useRef([]);
    const callDismissTimerRef = useRef(null);

    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);

    const COMMON_EMOJIS = [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
        '😘', '😋', '😛', '😜', '🤪', '😎', '😏', '😒', '😞', '😔', '😢', '😭', '😡', '😠', '🤬', '🤯',
        '😳', '🥵', '🥶', '😱', '😨', '😰', '🤤', '🤢', '🤮', '😴', '😷', '👻', '💀', '👽', '👾', '🤖',
        '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '👈', '👉', '👆', '👇', '✋',
        '👋', '👏', '🙌', '👐', '🙏', '✍️', '💅', '🤳', '💪', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤',
        '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🌟', '⭐', '✨', '⚡'
    ];

    const formatTime = (secs) => {
        const mins = Math.floor(secs / 60);
        const remainingSecs = secs % 60;
        return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
    };

    const handleEmojiClick = (emoji) => {
        setNewMessage(prev => prev + emoji);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Detect best supported MIME type
            let selectedMimeType = 'audio/webm';
            let selectedExtension = 'webm';
            
            if (MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')) {
                selectedMimeType = 'audio/ogg; codecs=opus';
                selectedExtension = 'ogg';
            } else if (MediaRecorder.isTypeSupported('audio/webm; codecs=opus')) {
                selectedMimeType = 'audio/webm; codecs=opus';
                selectedExtension = 'webm';
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = reader.result;
                    setSelectedFile({
                        name: `Áudio Gravado.${selectedExtension}`,
                        mimetype: selectedMimeType.split(';')[0],
                        data: base64data,
                        preview: null
                    });
                };
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Erro ao acessar microfone:", err);
            alert("Não foi possível acessar o microfone. Verifique as permissões de gravação de áudio no seu navegador.");
        }
    };

    const stopRecording = (cancel = false) => {
        if (!mediaRecorderRef.current) return;
        
        clearInterval(recordingTimerRef.current);
        
        if (cancel) {
            mediaRecorderRef.current.onstop = () => {
                const stream = mediaRecorderRef.current.stream;
                stream.getTracks().forEach(track => track.stop());
            };
        }
        
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    };

    // Keep refs in sync for use inside socket callbacks (avoids stale closures)
    useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
    useEffect(() => { chatsRef.current = chats; }, [chats]);

    // Request browser notification permission on first load
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Sound generator using Web Audio API — no external files needed
    const playSound = (type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (type === 'message') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.5, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.4);
            } else if (type === 'call') {
                // Two-tone ringtone repeated 3x
                const ring = (startT) => {
                    [520, 480].forEach((freq, i) => {
                        const o = ctx.createOscillator();
                        const g = ctx.createGain();
                        o.connect(g);
                        g.connect(ctx.destination);
                        o.type = 'sine';
                        o.frequency.value = freq;
                        const t = startT + i * 0.3;
                        g.gain.setValueAtTime(0, t);
                        g.gain.linearRampToValueAtTime(0.6, t + 0.05);
                        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
                        o.start(t);
                        o.stop(t + 0.3);
                    });
                };
                ring(ctx.currentTime);
                ring(ctx.currentTime + 0.9);
                ring(ctx.currentTime + 1.8);
            }
        } catch (e) {
            console.warn('Audio error:', e);
        }
    };

    const dismissIncomingCall = () => {
        setIncomingCall(null);
        if (callDismissTimerRef.current) {
            clearTimeout(callDismissTimerRef.current);
            callDismissTimerRef.current = null;
        }
    };

    const fetchFinanceData = async () => {
        try {
            const tenantRes = await fetch(`${SERVER_URL}/api/admin/tenant`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const tenantData = await tenantRes.json();
            if (tenantRes.ok) setTenantInfo(tenantData);

            const paymentsRes = await fetch(`${SERVER_URL}/api/admin/payments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const paymentsData = await paymentsRes.json();
            if (paymentsRes.ok) setTenantPayments(paymentsData);

            const pixRes = await fetch(`${SERVER_URL}/api/settings/root_pix_key`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const pixData = await pixRes.json();
            if (pixRes.ok) setFinanceRootPixKey(pixData.value || '');
        } catch (err) {
            console.error('Erro ao buscar dados financeiros:', err);
        }
    };

    useEffect(() => {
        if (activeSidebarTab === 'finance') {
            fetchFinanceData();
        }
    }, [activeSidebarTab]);

    // Ringtone loop when incoming call is active
    useEffect(() => {
        let intervalId;
        if (incomingCall) {
            playSound('call');
            // Play the synthesized ringtone (approx 2.1s duration) every 3500ms
            intervalId = setInterval(() => {
                playSound('call');
            }, 3500);
        }
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [incomingCall]);

    const showBrowserNotification = (title, body) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(title, { body, icon: '/logo.png', silent: true });
            n.onclick = () => { window.focus(); n.close(); };
            setTimeout(() => n.close(), 8000);
        }
    };

    // Initialize socket with token handshake
    useEffect(() => {
        if (!token) return;
        const newSocket = io(SERVER_URL, {
            auth: { token }
        });
        setSocket(newSocket);

        newSocket.on('whatsapp_status', (data) => {
            setIsReady(data.ready);
            setQrCode(data.qr);
            setConnError(data.error || null);
            if (data.ready) {
                fetchChats();
            }
        });

        newSocket.on('whatsapp_message', (msg) => {
            setMessages((prev) => {
                const exists = prev.find(m => m.id === msg.id);
                if (exists) {
                    return prev.map(m => m.id === msg.id ? { ...m, senderName: m.senderName || msg.senderName } : m);
                }
                return [...prev, msg];
            });
            fetchChats();

            // Sound + notification for incoming messages only
            if (!msg.fromMe) {
                const chatId = msg.chatId || msg.from;
                const chat = chatsRef.current.find(c => c.id === chatId);
                const fromVal = msg.from;
                const fromStr = typeof fromVal === 'string' ? fromVal : (fromVal?._serialized || '');
                const contactName = chat?.name || fromStr.split('@')[0] || 'Contato';
                const isCurrentChat = activeChatRef.current?.id === chatId;

                if (!isCurrentChat || document.hidden) {
                    playSound('message');
                    showBrowserNotification(`💬 ${contactName}`, msg.body || 'Nova mensagem');
                }
            }
        });

        newSocket.on('whatsapp_call', (call) => {
            const chat = chatsRef.current.find(c => c.id === call.from);
            const fromVal = call.from;
            const fromStr = typeof fromVal === 'string' ? fromVal : (fromVal?._serialized || '');
            const contactName = chat?.name || fromStr.split('@')[0] || 'Desconhecido';

            setIncomingCall({ from: call.from, name: contactName, isVideo: call.isVideo });
            showBrowserNotification(
                call.isVideo ? '📹 Chamada de Vídeo' : '📞 Chamada de Voz',
                `${contactName} está ligando... Atenda pelo celular`
            );

            if (callDismissTimerRef.current) clearTimeout(callDismissTimerRef.current);
            callDismissTimerRef.current = setTimeout(() => {
                setIncomingCall(null);
            }, 30000);
        });

        newSocket.on('chat_unread', () => fetchChats());
        newSocket.on('chat_read', () => fetchChats());

        newSocket.on('whatsapp_message_edit', (msgEdit) => {
            setMessages((prev) => 
                prev.map(m => m.id === msgEdit.id ? { ...m, body: msgEdit.body } : m)
            );
        });

        newSocket.on('whatsapp_message_ack', (data) => {
            setMessages((prev) => 
                prev.map(m => m.id === data.id ? { ...m, ack: data.ack } : m)
            );
        });

        return () => newSocket.close();
    }, [token]);

    const handleAudioEnded = (endedMsgId) => {
        const activeChatMessages = messages.filter(m => m.chatId === activeChat.id || m.from === activeChat.id || m.to === activeChat.id);
        const endedIdx = activeChatMessages.findIndex(m => m.id === endedMsgId);
        if (endedIdx === -1) return;

        // Find the next message that is audio/ptt
        const nextAudioMsg = activeChatMessages.slice(endedIdx + 1).find(m => m.type === 'audio' || m.type === 'ptt');
        if (nextAudioMsg) {
            const nextAudioEl = document.getElementById(`audio-${nextAudioMsg.id}`);
            if (nextAudioEl) {
                nextAudioEl.play().catch(err => {
                    console.error("Erro ao reproduzir o próximo áudio:", err);
                });
            }
        }
    };

    const fetchChats = () => {
        if (!token) return;
        setLoadingChats(true);
        fetch(`${SERVER_URL}/api/chats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setChats(data);
                } else {
                    setChats([]);
                }
                setLoadingChats(false);
            })
            .catch((err) => {
                console.error(err);
                setChats([]);
                setLoadingChats(false);
            });
    };

    // Load operators (only for admin)
    const fetchOperators = () => {
        if (user.role !== 'admin' || !token) return;
        fetch(`${SERVER_URL}/api/admin/operators`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setOperators(data);
            })
            .catch(console.error);
    };

    useEffect(() => {
        if (activeSidebarTab === 'operators') {
            fetchOperators();
        }
        if (activeSidebarTab === 'responses') {
            fetchAutoResponses();
        }
    }, [activeSidebarTab]);

    const fetchAutoResponses = () => {
        if (!token) return;
        fetch(`${SERVER_URL}/api/admin/auto-responses`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.first_of_day) {
                    setAutoRespFirstOfDay({
                        enabled: !!data.first_of_day.enabled,
                        message: data.first_of_day.message
                    });
                }
            })
            .catch(console.error);
    };

    const saveAutoResponse = async (type, enabled, message) => {
        setAutoRespSaving(true);
        setAutoRespMsg('');
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/auto-responses/${type}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ enabled, message })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
            setAutoRespMsg('Salvo com sucesso!');
            setTimeout(() => setAutoRespMsg(''), 3000);
        } catch (err) {
            setAutoRespMsg(`Erro: ${err.message}`);
        } finally {
            setAutoRespSaving(false);
        }
    };

    // Fetch user messages when chat is selected
    useEffect(() => {
        setShowEmojiPicker(false);
        setReplyToMessage(null);
        if (isRecording) stopRecording(true);

        if (activeChat && isReady && token) {
            // Optimistically update
            setChats(prev => prev.map(c =>
                c.id === activeChat.id ? { ...c, unreadCount: 0 } : c
            ));

            fetch(`${SERVER_URL}/api/chats/${encodeURIComponent(activeChat.id)}/read`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(console.error);

            fetch(`${SERVER_URL}/api/chats/${encodeURIComponent(activeChat.id)}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setMessages(data);
                })
                .catch(console.error);
        }
    }, [activeChat, isReady, token]);

    // Auto-focus input when chat is selected
    useEffect(() => {
        if (activeChat) {
            setTimeout(() => messageInputRef.current?.focus(), 100);
        }
    }, [activeChat]);

    // ESC key closes active chat (or emoji picker if open)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showEmojiPicker) {
                    setShowEmojiPicker(false);
                } else if (replyToMessage) {
                    setReplyToMessage(null);
                } else if (activeChat) {
                    setActiveChat(null);
                    setMessages([]);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeChat, showEmojiPicker, replyToMessage]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeChat]);

    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedFile) || !activeChat || !socket) return;

        if (editingMessage) {
            socket.emit('edit_message', {
                messageId: editingMessage.id,
                newText: newMessage.trim()
            });
            setEditingMessage(null);
        } else {
            socket.emit('send_message', {
                chatId: activeChat.id,
                text: newMessage.trim(),
                fileData: selectedFile,
                quotedMessageId: replyToMessage ? replyToMessage.id : null
            });
        }

        setNewMessage('');
        setSelectedFile(null);
        setReplyToMessage(null);
        setShowEmojiPicker(false);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            setSelectedFile({
                name: file.name,
                mimetype: file.type,
                data: reader.result,
                preview: file.type.startsWith('image/') ? reader.result : null
            });
        };
        e.target.value = '';
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                    setSelectedFile({
                        name: 'Imagem Colada.png',
                        mimetype: file.type,
                        data: reader.result,
                        preview: reader.result
                    });
                };
                e.preventDefault();
                break;
            }
        }
    };

    const handleMarkUnread = async (e, chatId) => {
        e.stopPropagation();
        setChats(prev => prev.map(c =>
            c.id === chatId ? { ...c, unreadCount: -1 } : c
        ));

        try {
            await fetch(`${SERVER_URL}/api/chats/${encodeURIComponent(chatId)}/unread`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error(err);
            fetchChats();
        }
    };

    const handleConnectWhatsApp = async () => {
        try {
            await fetch(`${SERVER_URL}/api/admin/whatsapp/connect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleDisconnectWhatsApp = async () => {
        if (!window.confirm('Tem certeza de que deseja desconectar o WhatsApp? A sessão ativa será fechada.')) return;
        try {
            await fetch(`${SERVER_URL}/api/admin/whatsapp/disconnect`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateOperator = async (e) => {
        e.preventDefault();
        if (!newOpName.trim() || !newOpUsername.trim() || (editingOp ? false : !newOpPassword.trim())) return;

        setOpError('');
        setOpSuccess('');

        try {
            const body = {
                name: newOpName.trim(),
                username: newOpUsername.trim()
            };
            if (newOpPassword.trim()) body.password = newOpPassword.trim();

            if (editingOp) {
                const res = await fetch(`${SERVER_URL}/api/admin/operators/${editingOp.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('Erro ao atualizar atendente.');
                setOpSuccess(`Atendente "${newOpUsername}" atualizado!`);
                setEditingOp(null);
            } else {
                const res = await fetch(`${SERVER_URL}/api/admin/operators`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar atendente.');
                setOpSuccess(`Atendente "${newOpUsername}" cadastrado!`);
            }

            setNewOpName('');
            setNewOpUsername('');
            setNewOpPassword('');
            fetchOperators();
        } catch (err) {
            setOpError(err.message);
        }
    };

    const handleEditOpClick = (op) => {
        setEditingOp(op);
        setNewOpName(op.name);
        setNewOpUsername(op.username);
        setNewOpPassword('');
    };

    const handleDeleteOperator = async (opId, opName) => {
        if (!window.confirm(`Excluir atendente "${opName}"?`)) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/operators/${opId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao excluir atendente.');
            }
            fetchOperators();
        } catch (err) {
            alert(err.message);
        }
    };

    const filteredChats = chats.filter(c => (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

    const getInitials = (name) => {
        if (!name) return '?';
        return name.substring(0, 2).toUpperCase();
    };

    const formatText = (text) => {
        if (!text) return null;
        const textStr = typeof text === 'string' ? text : String(text);
        const parts = textStr.split(/(\*[^\*]+\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                return <strong key={index} className="font-bold">{part.slice(1, -1)}</strong>;
            }
            return part;
        });
    };

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: '#eae6df' }}>
            <div className="flex w-full h-full max-w-[1600px] mx-auto shadow-2xl bg-white overflow-hidden md:py-4 md:px-4">

                {/* Sidebar */}
                <div className="w-full md:w-[400px] flex-shrink-0 border-r bg-white flex flex-col h-full z-20 shadow-md md:rounded-l-2xl overflow-hidden">

                    {/* Sidebar Header */}
                    <div className="p-4 bg-[#f0f2f5] flex justify-between items-center h-16 border-b">
                        <div className="font-semibold text-lg flex items-center space-x-3 flex-1 min-w-0 pr-2">
                            <div className="w-10 h-10 flex-shrink-0 rounded-full bg-green-600 text-white flex items-center justify-center font-bold shadow-sm">
                                {getInitials(user.name)}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-gray-800 font-bold truncate text-sm leading-tight" title={user.name}>{user.name}</span>
                                <span className="text-gray-500 font-bold text-[10px] uppercase tracking-wide leading-none">{user.role}</span>
                            </div>
                        </div>
                        <div className="flex space-x-2">
                            <button onClick={onLogout} className="hover:text-red-500 text-gray-500 transition-colors bg-white p-2 rounded-full shadow-sm" title="Sair do ZappTor">
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Connection Status Banner */}
                    <div className={classNames("px-4 py-2 text-[11px] font-bold flex items-center justify-center transition-all duration-300 border-b", {
                        "bg-green-50 text-green-700 border-green-100": isReady,
                        "bg-red-50 text-red-700 border-red-100": !isReady
                    })}>
                        {isReady ? (
                            <><CheckCircle2 size={13} className="mr-1.5 flex-shrink-0" /> WhatsApp Conectado</>
                        ) : (
                            <><AlertCircle size={13} className="mr-1.5 flex-shrink-0" /> WhatsApp Desconectado</>
                        )}
                    </div>

                    {/* Admin Navigation Tabs */}
                    {user.role === 'admin' && (
                        <div className="flex border-b border-gray-100 bg-gray-50/50 p-1 gap-0.5">
                            <button
                                onClick={() => setActiveSidebarTab('chat')}
                                className={classNames("flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1", {
                                    "bg-white text-green-600 shadow-sm border border-gray-100": activeSidebarTab === 'chat',
                                    "text-gray-500 hover:text-gray-800": activeSidebarTab !== 'chat'
                                })}
                            >
                                <MessageSquare size={14} />
                                <span>Chats</span>
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('whatsapp')}
                                className={classNames("flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1", {
                                    "bg-white text-green-600 shadow-sm border border-gray-100": activeSidebarTab === 'whatsapp',
                                    "text-gray-500 hover:text-gray-800": activeSidebarTab !== 'whatsapp'
                                })}
                            >
                                <QrCode size={14} />
                                <span>Conexão</span>
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('operators')}
                                className={classNames("flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1", {
                                    "bg-white text-green-600 shadow-sm border border-gray-100": activeSidebarTab === 'operators',
                                    "text-gray-500 hover:text-gray-800": activeSidebarTab !== 'operators'
                                })}
                            >
                                <Users size={14} />
                                <span>Equipe</span>
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('responses')}
                                className={classNames("flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1", {
                                    "bg-white text-green-600 shadow-sm border border-gray-100": activeSidebarTab === 'responses',
                                    "text-gray-500 hover:text-gray-800": activeSidebarTab !== 'responses'
                                })}
                            >
                                <Smile size={14} />
                                <span>Bot</span>
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('finance')}
                                className={classNames("flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1", {
                                    "bg-white text-green-600 shadow-sm border border-gray-100": activeSidebarTab === 'finance',
                                    "text-gray-500 hover:text-gray-800": activeSidebarTab !== 'finance'
                                })}
                            >
                                <CreditCard size={14} />
                                <span>Planos</span>
                            </button>
                        </div>
                    )}

                    {/* Sidebar Content Based on Active Tab */}
                    {activeSidebarTab === 'chat' && (
                        <>
                            {/* Search */}
                            <div className="p-3 bg-white border-b border-gray-100">
                                <div className="relative flex items-center bg-[#f0f2f5] rounded-xl overflow-hidden px-3 py-1.5 transition-shadow focus-within:ring-2 focus-within:ring-green-400">
                                    <Search size={18} className="text-gray-500 mr-2" />
                                    <input
                                        type="text"
                                        placeholder="Pesquisar conversa..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-transparent border-none focus:ring-0 text-sm outline-none py-1"
                                    />
                                </div>
                            </div>

                            {/* Chat List */}
                            <div className="overflow-y-auto flex-1 h-0 bg-white">
                                {loadingChats && chats.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
                                        Sincronizando conversas...
                                    </div>
                                ) : filteredChats.length > 0 ? (
                                    filteredChats.map(chat => (
                                        <div
                                            key={chat.id}
                                            className={classNames("flex items-center p-3 cursor-pointer transition-colors border-b border-gray-50 group", {
                                                "bg-[#f0f2f5]": activeChat?.id === chat.id,
                                                "hover:bg-[#f5f6f6]": activeChat?.id !== chat.id
                                            })}
                                            onClick={() => setActiveChat(chat)}
                                        >
                                            <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden shadow-sm">
                                                <ChatAvatar key={chat.id} chatId={chat.id} name={chat.name} token={token} />
                                            </div>
                                            <div className="ml-4 flex-1 overflow-hidden">
                                                <div className="flex justify-between items-baseline mb-0.5">
                                                    <div className="font-bold text-gray-800 truncate pr-2 text-[15px]">{chat.name || 'Desconhecido'}</div>
                                                    {chat.timestamp && (
                                                        <div className="text-[10px] text-gray-400 flex-shrink-0 font-semibold">
                                                            {new Date(chat.timestamp * 1000).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    )}
                                                </div>
                                                {chat.unreadCount !== 0 ? (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-green-600 font-bold truncate">Não lida</span>
                                                        <div className="flex items-center space-x-1.5">
                                                            {chat.pinned && <Pin size={12} className="text-gray-400 rotate-45" />}
                                                            <span className="bg-green-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                                                {chat.unreadCount > 0 ? chat.unreadCount : '!'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-between items-center">
                                                        <div className="text-xs text-gray-400 truncate">Ver mensagens</div>
                                                        <div className="flex items-center space-x-1.5">
                                                            {chat.pinned && <Pin size={12} className="text-gray-400 rotate-45" />}
                                                            <button onClick={(e) => handleMarkUnread(e, chat.id)} className="text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="Marcar como não lida">
                                                                <EyeOff size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        {searchQuery ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa disponível.'}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* WhatsApp Connection Management Tab */}
                    {activeSidebarTab === 'whatsapp' && (
                        <div className="p-6 flex-1 overflow-y-auto bg-gray-50 flex flex-col justify-between">
                            <div className="space-y-6">
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Conectar WhatsApp da Empresa</h3>
                                {isReady ? (
                                    <div className="bg-green-50 p-4 border border-green-200 rounded-2xl text-center space-y-3">
                                        <CheckCircle2 size={40} className="text-green-600 mx-auto" />
                                        <div>
                                            <p className="font-bold text-green-800 text-sm">ZappTor Ativo</p>
                                            <p className="text-xs text-green-600 font-semibold mt-0.5">Seu dispositivo está emparelhado e pronto para receber/enviar mensagens.</p>
                                        </div>
                                    </div>
                                ) : qrCode ? (
                                    <div className="bg-white p-4 border border-gray-200 rounded-2xl text-center space-y-4 shadow-sm">
                                        <p className="text-xs font-bold text-gray-700 uppercase">Escaneie o QR Code</p>
                                        <div className="bg-gray-100 p-2 rounded-xl flex items-center justify-center">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=250x250`}
                                                alt="WhatsApp QR Code"
                                                className="w-full max-w-[200px] aspect-square object-contain"
                                            />
                                        </div>
                                        <p className="text-[11px] text-gray-500 leading-normal font-medium">Abra o WhatsApp no seu celular &gt; Menu ou Configurações &gt; Aparelhos Conectados &gt; Conectar um Aparelho.</p>
                                    </div>
                                ) : (
                                    <div className="bg-white p-6 border border-gray-200 rounded-2xl text-center space-y-2 shadow-sm text-gray-500">
                                        <QrCode size={40} className="mx-auto text-gray-300" />
                                        <p className="font-bold text-sm text-gray-700">Dispositivo Desconectado</p>
                                        <p className="text-xs leading-relaxed font-semibold">Inicie a conexão para obter o QR Code.</p>
                                    </div>
                                )}

                                {connError && (
                                    <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs font-semibold flex items-center space-x-2">
                                        <AlertCircle size={16} className="flex-shrink-0" />
                                        <span>{connError}</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 border-t space-y-3">
                                {!isReady && (
                                    <button
                                        onClick={handleConnectWhatsApp}
                                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-green-500/10 transition-all flex items-center justify-center space-x-2 text-sm"
                                    >
                                        <QrCode size={18} />
                                        <span>Iniciar Conexão (QR Code)</span>
                                    </button>
                                )}
                                <button
                                    onClick={handleDisconnectWhatsApp}
                                    className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm shadow-sm"
                                >
                                    <X size={18} />
                                    <span>Desconectar / Parar WhatsApp</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Operators Management Tab */}
                    {activeSidebarTab === 'operators' && (
                        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 flex flex-col space-y-6">
                            {/* Operator Creation Form */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center space-x-2">
                                    {editingOp ? <Edit2 size={16} className="text-blue-600" /> : <UserPlus size={16} className="text-green-600" />}
                                    <span>{editingOp ? 'Editar Atendente' : 'Novo Atendente (Operador)'}</span>
                                </h4>
                                {opError && <p className="text-xs text-red-600 font-bold">{opError}</p>}
                                {opSuccess && <p className="text-xs text-green-600 font-bold">{opSuccess}</p>}
                                <form onSubmit={handleCreateOperator} className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Nome do Atendente"
                                        value={newOpName}
                                        onChange={(e) => setNewOpName(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none text-xs font-medium bg-gray-50 focus:bg-white focus:border-green-500 transition-all"
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="Usuário de Login"
                                        value={newOpUsername}
                                        onChange={(e) => setNewOpUsername(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none text-xs font-medium bg-gray-50 focus:bg-white focus:border-green-500 transition-all"
                                        required
                                    />
                                    <input
                                        type="password"
                                        placeholder={editingOp ? "Nova Senha (opcional)" : "Senha"}
                                        value={newOpPassword}
                                        onChange={(e) => setNewOpPassword(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none text-xs font-medium bg-gray-50 focus:bg-white focus:border-green-500 transition-all"
                                        required={!editingOp}
                                    />
                                    <div className="flex space-x-2">
                                        <button
                                            type="submit"
                                            className={`flex-1 font-bold py-2.5 rounded-xl text-xs shadow-md transition-all ${editingOp ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/10' : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/10'}`}
                                        >
                                            {editingOp ? 'Salvar Alterações' : 'Adicionar Atendente'}
                                        </button>
                                        {editingOp && (
                                            <button
                                                type="button"
                                                onClick={() => { setEditingOp(null); setNewOpName(''); setNewOpUsername(''); setNewOpPassword(''); }}
                                                className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-xs transition-all"
                                            >
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </div>

                            {/* Operator list */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Atendentes Cadastrados</h4>
                                {operators.length === 0 ? (
                                    <p className="text-xs text-gray-400 font-semibold italic text-center py-6">Nenhum atendente cadastrado.</p>
                                ) : (
                                    <div className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                        {operators.map((op) => (
                                            <div key={op.id} className="flex justify-between items-center p-3 hover:bg-gray-50 transition-colors">
                                                <div className="min-w-0 pr-2">
                                                    <p className="text-xs font-bold text-gray-900 truncate">{op.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold truncate">Login: {op.username}</p>
                                                </div>
                                                <div className="flex space-x-1">
                                                    <button
                                                        onClick={() => handleEditOpClick(op)}
                                                        className="text-blue-500 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Editar atendente"
                                                    >
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteOperator(op.id, op.name)}
                                                        className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                                        title="Remover atendente"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Auto-Response (Bot) Tab */}
                    {activeSidebarTab === 'responses' && (
                        <div className="flex-1 overflow-y-auto bg-gray-50 p-5 flex flex-col space-y-4">
                            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center space-x-2">
                                <Smile size={15} className="text-green-600" />
                                <span>Respostas Automaticas</span>
                            </h3>

                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex-1 min-w-0 pr-3">
                                        <p className="text-xs font-bold text-gray-800">Primeira mensagem do dia</p>
                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                            Enviada quando o contato manda a 1a mensagem do dia
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setAutoRespFirstOfDay(prev => ({ ...prev, enabled: !prev.enabled }))}
                                        className={classNames(
                                            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                                            { "bg-green-500": autoRespFirstOfDay.enabled, "bg-gray-200": !autoRespFirstOfDay.enabled }
                                        )}
                                    >
                                        <span className={classNames(
                                            "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
                                            { "translate-x-5": autoRespFirstOfDay.enabled, "translate-x-0": !autoRespFirstOfDay.enabled }
                                        )} />
                                    </button>
                                </div>
                                <div className="p-4 space-y-3">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mensagem</label>
                                    <textarea
                                        value={autoRespFirstOfDay.message}
                                        onChange={e => setAutoRespFirstOfDay(prev => ({ ...prev, message: e.target.value }))}
                                        rows={7}
                                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-xs font-medium bg-gray-50 focus:bg-white focus:border-green-500 transition-all resize-none leading-relaxed"
                                        placeholder="Digite a mensagem automatica..."
                                    />
                                    <p className="text-[10px] text-gray-400">Use *texto* para negrito</p>
                                    {autoRespMsg && (
                                        <p className={classNames("text-xs font-bold", {
                                            "text-green-600": autoRespMsg.startsWith('Salvo'),
                                            "text-red-600": autoRespMsg.startsWith('Erro')
                                        })}>
                                            {autoRespMsg}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => saveAutoResponse('first_of_day', autoRespFirstOfDay.enabled, autoRespFirstOfDay.message)}
                                        disabled={autoRespSaving || !autoRespFirstOfDay.message.trim()}
                                        className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all"
                                    >
                                        {autoRespSaving ? 'Salvando...' : 'Salvar Configuração'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Finance Management Tab */}
                    {activeSidebarTab === 'finance' && (
                        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 flex flex-col space-y-6">
                            {tenantInfo && (() => {
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
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                        <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center space-x-2">
                                            <CreditCard size={16} className="text-green-600" />
                                            <span>Sua Assinatura & Plano</span>
                                        </h4>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center p-3 rounded-xl bg-gray-50 border border-gray-100">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Plano Atual</p>
                                                    <p className="text-sm font-bold text-gray-800">{formatPlanName(tenantInfo.plan)}</p>
                                                </div>
                                                <span className="text-xs font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full uppercase">
                                                    {tenantInfo.status === 'active' ? 'Ativo' : 'Suspenso'}
                                                </span>
                                            </div>

                                            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Validade da Licença</p>
                                                <p className="text-sm font-bold text-gray-800">
                                                    {new Date(tenantInfo.expires_at).toLocaleDateString('pt-BR')}
                                                </p>
                                                {new Date(tenantInfo.expires_at) < new Date() ? (
                                                    <p className="text-xs text-red-500 font-bold">Sua licença expirou. Realize o pagamento para reativar o serviço.</p>
                                                ) : (
                                                    <p className="text-xs text-gray-500 font-semibold">Serviço ativo e operacional.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Tabela de Preços e Planos */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center space-x-2">
                                    <MessageSquare size={16} className="text-green-600" />
                                    <span>Tabela de Planos ZappTor</span>
                                </h4>
                                
                                <div className="grid grid-cols-1 gap-2.5">
                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center text-xs">
                                        <div>
                                            <p className="font-bold text-gray-800">🟢 Plano FREE</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">2 meses grátis a partir do cadastro</p>
                                        </div>
                                        <span className="font-extrabold text-green-600 bg-green-50 px-2 py-1 rounded-lg">R$ 0,00</span>
                                    </div>

                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center text-xs">
                                        <div>
                                            <p className="font-bold text-gray-800">🟢 Plano Mensal</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Sem fidelidade</p>
                                        </div>
                                        <span className="font-extrabold text-gray-800">R$ 25,00/mês</span>
                                    </div>

                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center text-xs">
                                        <div>
                                            <p className="font-bold text-gray-800">🔵 Plano Trimestral</p>
                                            <p className="text-[10px] text-green-600 font-bold mt-0.5">Economia de R$ 3,00</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-extrabold text-gray-800 block">R$ 24,00/mês</span>
                                            <span className="text-[9px] text-gray-400 font-bold">Total: R$ 72,00</span>
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center text-xs">
                                        <div>
                                            <p className="font-bold text-gray-800">🟠 Plano Semestral</p>
                                            <p className="text-[10px] text-green-600 font-bold mt-0.5">Economia de R$ 18,00</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-extrabold text-gray-800 block">R$ 22,00/mês</span>
                                            <span className="text-[9px] text-gray-400 font-bold">Total: R$ 132,00</span>
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center text-xs">
                                        <div>
                                            <p className="font-bold text-gray-800">🟣 Plano 9 Meses</p>
                                            <p className="text-[10px] text-green-600 font-bold mt-0.5">Economia de R$ 36,00</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-extrabold text-gray-800 block">R$ 21,00/mês</span>
                                            <span className="text-[9px] text-gray-400 font-bold">Total: R$ 189,00</span>
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-xl bg-green-50/70 border border-green-200/60 flex justify-between items-center text-xs relative overflow-hidden">
                                        <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-950 text-[8px] font-extrabold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                                            🏆 Recomendado
                                        </div>
                                        <div className="mt-1">
                                            <p className="font-bold text-gray-800">💎 Plano Anual</p>
                                            <p className="text-[10px] text-green-700 font-bold mt-0.5">Economia de R$ 60,00/ano</p>
                                        </div>
                                        <div className="text-right mt-1">
                                            <span className="font-extrabold text-green-700 block">R$ 20,00/mês</span>
                                            <span className="text-[9px] text-gray-400 font-bold">Total: R$ 240,00</span>
                                        </div>
                                    </div>
                                </div>
                            </div>



                            {/* Payments List */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Histórico de Cobranças / Mensalidades</h4>
                                {tenantPayments.length === 0 ? (
                                    <p className="text-xs text-gray-400 font-semibold italic text-center py-6">Nenhuma fatura encontrada.</p>
                                ) : (
                                    <div className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                        {tenantPayments.map((pay) => (
                                            <div key={pay.id} className="flex justify-between items-center p-3.5 hover:bg-gray-50 transition-colors">
                                                <div>
                                                    <p className="text-sm font-bold text-gray-800">R$ {parseFloat(pay.amount).toFixed(2)}</p>
                                                    <p className="text-[10px] text-gray-400 font-semibold">
                                                        Vence em: {new Date(pay.due_date).toLocaleDateString('pt-BR')}
                                                    </p>
                                                    {pay.status === 'paid' && (
                                                        <span className="text-[9px] text-green-600 font-bold flex items-center space-x-0.5 mt-0.5">
                                                            <CheckCircle2 size={10} />
                                                            <span>Pago em {new Date(pay.paid_at).toLocaleDateString('pt-BR')}</span>
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div>
                                                    {pay.status === 'pending' ? (
                                                        <button
                                                            onClick={() => setSelectedPaymentForPix(pay)}
                                                            className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-sm"
                                                        >
                                                            Pagar com PIX
                                                        </button>
                                                    ) : (
                                                        <span className="bg-gray-100 text-gray-500 px-3 py-1.5 rounded-xl text-xs font-bold">
                                                            Pago
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat Area */}
                <div className="hidden md:flex flex-1 flex-col bg-[#efeae2] relative md:rounded-r-2xl overflow-hidden before:content-[''] before:absolute before:inset-0 before:opacity-[0.06] before:pointer-events-none before:bg-[url('https://wallpapers.com/images/hd/whatsapp-chat-dark-background-y5w9uv7uivq253ik.jpg')] before:bg-repeat">
                    {activeChat && activeSidebarTab === 'chat' ? (
                        <>
                            {/* Header */}
                            <div className="bg-[#f0f2f5] px-6 py-3 flex items-center justify-between shadow-sm z-10 border-l border-gray-200 h-16">
                                <div className="flex items-center">
                                    <div className="w-10 h-10 rounded-full flex-shrink-0 mr-4 shadow-sm overflow-hidden">
                                        <ChatAvatar key={activeChat.id} chatId={activeChat.id} name={activeChat.name} token={token} />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="font-bold text-gray-800 text-[17px] leading-tight">
                                            {activeChat.name || 'Desconhecido'}
                                        </div>
                                        {!activeChat.isGroup && activeChat.id && (
                                            <span className="text-[12px] text-gray-500 font-normal mt-0.5">
                                                {formatWhatsAppNumber(activeChat.id)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex space-x-4 text-gray-500">
                                    <Search size={18} className="cursor-pointer hover:text-gray-700" />
                                    <MoreVertical size={18} className="cursor-pointer hover:text-gray-700" />
                                </div>
                            </div>

                            {/* Messages List */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-3 z-10 custom-scrollbar">
                                {messages.filter(m => m.chatId === activeChat.id || m.from === activeChat.id || m.to === activeChat.id).map((msg, idx, arr) => {
                                    const isSentByMe = msg.fromMe;
                                    const senderName = msg.senderName || (isSentByMe ? 'Sistema' : (activeChat.name || 'Desconhecido'));

                                    const prevMsg = idx > 0 ? arr[idx - 1] : null;
                                    const showDateSeparator = !prevMsg || (() => {
                                        const prevDate = new Date(prevMsg.timestamp * 1000);
                                        const currDate = new Date(msg.timestamp * 1000);
                                        return prevDate.getDate() !== currDate.getDate() ||
                                               prevDate.getMonth() !== currDate.getMonth() ||
                                               prevDate.getFullYear() !== currDate.getFullYear();
                                    })();

                                    return (
                                        <React.Fragment key={msg.id || idx}>
                                            {showDateSeparator && (
                                                <div className="flex justify-center my-4 w-full select-none animate-fade-in">
                                                    <span className="bg-[#e1f3fc] text-[#54656f] text-xs font-semibold px-4 py-1.5 rounded-lg shadow-sm tracking-wide">
                                                        {getDateSeparatorText(msg.timestamp)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={classNames("flex", { "justify-end": isSentByMe, "justify-start": !isSentByMe })}>
                                            <div className={classNames("max-w-[75%] rounded-lg px-3 pt-2 pb-1 shadow-sm text-[15px] relative group", {
                                                "bg-[#d9fdd3] text-gray-900 rounded-tr-none": isSentByMe,
                                                "bg-white text-gray-900 rounded-tl-none": !isSentByMe
                                            })}>
                                                {msg.senderName && (
                                                    <div className={classNames("text-xs font-bold mb-1 block w-full", {
                                                        "text-green-600": isSentByMe && msg.senderName === user.name,
                                                        "text-blue-600": !isSentByMe,
                                                        "text-gray-500": isSentByMe && msg.senderName !== user.name
                                                    })}>
                                                        {isSentByMe ? (msg.senderName === user.name ? 'Você' : senderName) : senderName}
                                                    </div>
                                                )}

                                                {/* Quoted Message Block */}
                                                {msg.quotedMsg && (
                                                    <div className="bg-black/5 border-l-4 border-green-500 rounded p-1.5 mb-1.5 text-xs select-none max-w-full flex flex-col opacity-85">
                                                        <span className="font-bold text-[10px] text-green-700">
                                                            {(() => {
                                                                const pVal = msg.quotedMsg.participant;
                                                                const pStr = typeof pVal === 'string' ? pVal : (pVal?._serialized || '');
                                                                const cleanParticipant = pStr.split('@')[0];
                                                                const cVal = activeChat.id;
                                                                const cStr = typeof cVal === 'string' ? cVal : (cVal?._serialized || '');
                                                                const cleanChatId = cStr.split('@')[0];
                                                                return cleanParticipant === cleanChatId ? (activeChat.name || 'Contato') : 'Você';
                                                            })()}
                                                        </span>
                                                        <span className="text-gray-600 truncate mt-0.5 max-w-xs">
                                                            {msg.quotedMsg.body || 'Mídia'}
                                                        </span>
                                                    </div>
                                                )}

                                                {msg.type === 'call_log' ? (
                                                    <div className="flex items-center space-x-2 italic text-gray-600 bg-black/5 p-2 rounded-md mb-1 mr-10">
                                                        <Phone size={16} />
                                                        <span>Chamada de voz/vídeo</span>
                                                    </div>
                                                ) : msg.hasMedia ? (
                                                    <div className="pr-12">
                                                        <MediaMessage msgId={msg.id} type={msg.type} token={token} onPlayEnded={handleAudioEnded} />
                                                        {msg.body && <div className="leading-snug whitespace-pre-wrap break-words mt-1">{formatText(msg.body)}</div>}
                                                    </div>
                                                ) : (
                                                    <div className="leading-snug pr-12 whitespace-pre-wrap break-words">
                                                        {msg.body ? formatText(msg.body) : <span className="italic text-gray-400 text-xs">Mensagem vazia</span>}
                                                    </div>
                                                )}

                                                <div className="text-[10px] text-gray-400 text-right mt-1 inline-block absolute bottom-1 right-2 w-max font-medium flex items-center space-x-1">
                                                    <span>
                                                        {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {isSentByMe && (
                                                        <MessageStatus ack={msg.ack} />
                                                    )}
                                                </div>

                                                {/* Hover Reply Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReplyToMessage(msg);
                                                        setEditingMessage(null);
                                                        messageInputRef.current?.focus();
                                                    }}
                                                    className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-green-600 shadow-md bg-white border border-gray-100 z-10"
                                                    style={{
                                                        left: isSentByMe ? '-40px' : 'auto',
                                                        right: !isSentByMe ? '-40px' : 'auto'
                                                    }}
                                                    title="Responder"
                                                >
                                                    <CornerUpLeft size={14} />
                                                </button>

                                                {/* Hover Edit Button */}
                                                {isSentByMe && !msg.hasMedia && msg.type !== 'call_log' && msg.body && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingMessage(msg);
                                                            const cleanText = (() => {
                                                                const prefix = `*${user.name}:*\n`;
                                                                if (msg.body && msg.body.startsWith(prefix)) {
                                                                    return msg.body.slice(prefix.length);
                                                                }
                                                                const match = msg.body && msg.body.match(/^\*.*:\*\n([\s\S]*)$/);
                                                                if (match) {
                                                                    return match[1];
                                                                }
                                                                return msg.body || '';
                                                            })();
                                                            setNewMessage(cleanText);
                                                            setReplyToMessage(null);
                                                            messageInputRef.current?.focus();
                                                        }}
                                                        className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-green-600 shadow-md bg-white border border-gray-100 z-10"
                                                        style={{
                                                            left: '-76px'
                                                        }}
                                                        title="Editar"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                                <div ref={messagesEndRef} className="h-4" />
                            </div>

                            {/* Input Area */}
                            <div className="bg-[#f0f2f5] px-4 py-3 z-10 border-l border-gray-200">
                                {editingMessage && (
                                    <div className="max-w-5xl mx-auto mb-2 bg-[#e2e8f0]/60 backdrop-blur-sm border-l-4 border-blue-500 rounded-xl p-3 flex items-center justify-between shadow-sm animate-slide-down">
                                        <div className="flex flex-col min-w-0 pr-4">
                                            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                                                <Edit2 size={12} /> Editar Mensagem
                                            </span>
                                            <span className="text-xs text-gray-600 truncate mt-0.5 max-w-xl">
                                                {editingMessage.body}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingMessage(null);
                                                setNewMessage('');
                                            }}
                                            className="text-gray-400 hover:text-red-500 hover:bg-gray-200 p-1.5 rounded-full transition-colors focus:outline-none"
                                            title="Cancelar edição"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}
                                {replyToMessage && (
                                    <div className="max-w-5xl mx-auto mb-2 bg-[#e2e8f0]/60 backdrop-blur-sm border-l-4 border-green-500 rounded-xl p-3 flex items-center justify-between shadow-sm animate-slide-down">
                                        <div className="flex flex-col min-w-0 pr-4">
                                            <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider">
                                                {replyToMessage.senderName || (replyToMessage.fromMe ? 'Você' : (activeChat.name || 'Contato'))}
                                            </span>
                                            <span className="text-xs text-gray-600 truncate mt-0.5 max-w-xl">
                                                {replyToMessage.body || 'Mídia'}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setReplyToMessage(null)}
                                            className="text-gray-400 hover:text-red-500 hover:bg-gray-200 p-1.5 rounded-full transition-colors focus:outline-none"
                                            title="Cancelar resposta"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                )}
                                {selectedFile && (
                                    <div className="bg-gray-100 p-2 mx-auto max-w-5xl mb-2 rounded border border-gray-200 flex items-center justify-between shadow-sm">
                                        <div className="flex items-center space-x-3 overflow-hidden">
                                            {selectedFile.preview ? (
                                                <img src={selectedFile.preview} alt="Preview" className="w-10 h-10 object-cover rounded bg-white" />
                                            ) : (
                                                <div className="w-10 h-10 bg-white rounded flex items-center justify-center text-gray-500">
                                                    <Paperclip size={20} />
                                                </div>
                                            )}
                                            <span className="text-sm font-medium text-gray-700 truncate">{selectedFile.name}</span>
                                        </div>
                                        <button onClick={() => setSelectedFile(null)} className="text-gray-500 hover:text-red-500 hover:bg-gray-200 p-1.5 rounded-full transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>
                                )}
                                <form onSubmit={handleSendMessage} className="flex items-center space-x-3 max-w-5xl mx-auto w-full relative">
                                    {showEmojiPicker && (
                                        <div className="absolute bottom-16 left-0 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 grid grid-cols-8 gap-2 w-64 max-h-48 overflow-y-auto z-50">
                                            {COMMON_EMOJIS.map((emoji, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => handleEmojiClick(emoji)}
                                                    className="text-xl hover:bg-gray-100 p-1 rounded transition-colors"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        onChange={handleFileSelect}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0 focus:outline-none"
                                        disabled={!isReady || isRecording}
                                        title="Anexar arquivo"
                                    >
                                        <Paperclip size={22} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className={classNames("p-2 rounded-full transition-colors flex-shrink-0 focus:outline-none", {
                                            "text-green-600 bg-green-50": showEmojiPicker,
                                            "text-gray-500 hover:text-gray-700 hover:bg-gray-200": !showEmojiPicker
                                        })}
                                        disabled={!isReady || isRecording}
                                        title="Emojis"
                                    >
                                        <Smile size={22} />
                                    </button>

                                    {isRecording ? (
                                        <div className="flex-1 flex items-center justify-between bg-red-50 text-red-700 rounded-xl px-4 py-2 border border-red-100 animate-pulse h-[46px]">
                                            <div className="flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
                                                <span className="text-xs font-semibold">Gravando áudio... {formatTime(recordingTime)}</span>
                                            </div>
                                            <div className="flex items-center space-x-1">
                                                <button
                                                    type="button"
                                                    onClick={() => stopRecording(true)}
                                                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-all"
                                                    title="Cancelar gravação"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => stopRecording(false)}
                                                    className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-100 rounded-full transition-all"
                                                    title="Parar e preparar gravação"
                                                >
                                                    <Check size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 relative shadow-sm rounded-xl overflow-hidden bg-white flex items-center pr-2 focus-within:ring-1 focus-within:ring-green-400 transition-shadow">
                                            <input
                                                ref={messageInputRef}
                                                type="text"
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                onPaste={handlePaste}
                                                placeholder="Digite uma mensagem..."
                                                className="w-full py-3.5 px-4 outline-none text-sm text-gray-700 disabled:bg-gray-100"
                                                disabled={!isReady}
                                            />
                                        </div>
                                    )}

                                    {!newMessage.trim() && !selectedFile && !isRecording ? (
                                        <button
                                            type="button"
                                            onClick={startRecording}
                                            className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full p-3.5 shadow-md transition-all duration-200 scale-100 hover:scale-105 flex items-center justify-center flex-shrink-0 focus:outline-none"
                                            disabled={!isReady}
                                            title="Gravar áudio"
                                        >
                                            <Mic size={20} />
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full p-3.5 shadow-md transition-all duration-200 disabled:opacity-50 disabled:scale-100 scale-100 hover:scale-105 flex items-center justify-center flex-shrink-0 focus:outline-none"
                                            disabled={!isReady || isRecording || (!newMessage.trim() && !selectedFile)}
                                        >
                                            <Send size={20} className="ml-0.5" />
                                        </button>
                                    )}
                                </form>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 z-10 p-8">
                            <div className="w-72 mt-[-10vh] mb-8 bg-white p-6 rounded-full shadow-lg flex items-center justify-center overflow-hidden h-72">
                                <img src="/logo.png" alt="ZappTor Logo" className="w-full h-full object-contain p-4" />
                            </div>
                            <h2 className="text-3xl font-light text-gray-700 mb-4">ZappTor {user.tenantName || 'Redes'}</h2>
                            {activeSidebarTab === 'whatsapp' ? (
                                <p className="mt-2 text-[15px] max-w-md text-center leading-relaxed">
                                    Use o painel ao lado para emparelhar seu WhatsApp com o sistema ZappTor.
                                </p>
                            ) : activeSidebarTab === 'operators' ? (
                                <p className="mt-2 text-[15px] max-w-md text-center leading-relaxed">
                                    Use a barra lateral para gerenciar sua equipe e dar acesso a outros atendentes.
                                </p>
                            ) : (
                                <>
                                    <p className="mt-2 text-[15px] max-w-md text-center leading-relaxed">
                                        Bem-vindo <span className="font-semibold text-gray-700">{user.name}</span>.<br />
                                        Selecione uma conversa na lista lateral para iniciar o atendimento.
                                    </p>
                                    <div className="mt-10 flex items-center space-x-2 text-xs text-gray-400 font-semibold">
                                         <CheckCircle2 size={16} /> <span>Mensagens enviadas aparecerão com a assinatura <strong className="text-gray-500">*{user.name}:*</strong> (com quebra de linha)</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {/* Floating Incoming Call Banner */}
            {incomingCall && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
                    <div className="pointer-events-auto bg-gray-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-gray-700/50 p-4 flex items-center justify-between space-x-4 animate-slide-down animate-pulse-border">
                        <div className="flex items-center space-x-3.5 min-w-0">
                            {/* Ringing Icon Container */}
                            <div className="relative flex-shrink-0">
                                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                                <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white shadow-lg animate-wiggle">
                                    {incomingCall.isVideo ? <Video size={24} /> : <PhoneCall size={24} />}
                                </div>
                            </div>
                            {/* Caller Details */}
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-base truncate text-gray-100">{incomingCall.name}</span>
                                <span className="text-[11px] text-green-400 font-bold uppercase tracking-wider flex items-center">
                                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                                    Ligando por {incomingCall.isVideo ? 'vídeo' : 'voz'}...
                                </span>
                                <span className="text-[10px] text-gray-400 mt-0.5">Atenda a chamada diretamente no seu celular</span>
                            </div>
                        </div>
                        {/* Action Buttons (Dismiss) */}
                        <div className="flex-shrink-0 flex items-center">
                            <button
                                onClick={dismissIncomingCall}
                                className="bg-red-600/95 hover:bg-red-500 active:bg-red-700 text-white rounded-xl px-4 py-2 text-xs font-extrabold shadow-md hover:shadow-lg transition-all flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-red-400"
                                title="Recusar chamada localmente"
                            >
                                <X size={14} />
                                <span>Dispensar</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIX Payment Modal */}
            {selectedPaymentForPix && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-5 animate-scale-up">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2">
                                <DollarSign size={20} className="text-green-600" />
                                <span>Pagamento da Mensalidade</span>
                            </h3>
                            <button
                                onClick={() => setSelectedPaymentForPix(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center space-y-1">
                                <p className="text-xs text-gray-500 font-semibold">Valor a ser Pago</p>
                                <p className="text-2xl font-extrabold text-gray-900">
                                    R$ {parseFloat(selectedPaymentForPix.amount).toFixed(2)}
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                                    Vencimento: {new Date(selectedPaymentForPix.due_date).toLocaleDateString('pt-BR')}
                                </p>
                            </div>

                            {financeRootPixKey ? (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-700 font-bold">Chave PIX do Destinatário:</p>
                                        <div className="bg-gray-100 p-3 rounded-xl border border-gray-200 select-all font-mono text-xs font-bold text-center break-all">
                                            {financeRootPixKey}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-[11px] text-yellow-800 font-bold leading-normal">
                                        ⚠️ IMPORTANTE: Realize a transferência do valor exato informado acima para a chave PIX exibida. Após concluir o pagamento, envie o comprovante para o administrador geral para que o acesso seja liberado.
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-center text-red-800 text-xs font-bold">
                                    Chave PIX do destinatário não configurada pelo administrador do sistema. Entre em contato com o suporte.
                                </div>
                            )}

                            <button
                                onClick={() => setSelectedPaymentForPix(null)}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-2xl transition-colors shadow-lg shadow-green-500/10 text-sm"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chat;
