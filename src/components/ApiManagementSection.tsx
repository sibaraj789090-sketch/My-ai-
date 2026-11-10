import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Plug,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  Power,
  ShieldCheck,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ExternalLink,
  Sparkles,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import {
  ApiCapabilityCategory,
  ApiConnectionTestResult,
  ApiProviderProtocol,
  FeatureProviderAssignments,
  SanitizedApiProviderEntry,
} from '../types';

interface ApiManagementSectionProps {
  onConfigUpdated: () => Promise<void>;
  onNotice: (msg: string) => void;
}

const CATEGORY_META: Array<{
  id: ApiCapabilityCategory;
  label: string;
  builtInLabel: string;
  defaultUrl: string;
  placeholderModel: string;
}> = [
  {
    id: 'text',
    label: 'Text AI API',
    builtInLabel: 'Built-in: Gemini 3.1 Flash Lite (Free Tier)',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    placeholderModel: 'gpt-4o / gemini-2.5-pro / claude-sonnet-4-20250514',
  },
  {
    id: 'image',
    label: 'Image Generation API',
    builtInLabel: 'Built-in: Free Image AI (Pollinations / AI Horde)',
    defaultUrl: 'https://api.openai.com/v1/images/generations',
    placeholderModel: 'gpt-image-1 / dall-e-3 / black-forest-labs/FLUX.1-dev',
  },
  {
    id: 'image_edit',
    label: 'Multi-Image Editing API',
    builtInLabel: 'Built-in: Free Image AI + Gemini Vision Edit',
    defaultUrl: 'https://api.openai.com/v1/images/edits',
    placeholderModel: 'gpt-image-1 / gemini-3.1-flash-lite-image',
  },
  {
    id: 'video',
    label: 'Video Generation API',
    builtInLabel: 'Built-in: Gemini Omni 1.2 Flash (Paid Key Required)',
    defaultUrl: 'https://api.example.com/v1/videos/generations',
    placeholderModel: 'gemini-omni-1.2-flash / veo-3 / runway-gen4',
  },
  {
    id: 'audio',
    label: 'Music Generation API',
    builtInLabel: 'Built-in: Lyria 3 Clip (Paid Key Required)',
    defaultUrl: 'https://api.example.com/v1/audio/music',
    placeholderModel: 'lyria-3-clip-preview / suno-v4',
  },
  {
    id: 'code',
    label: 'Code AI API',
    builtInLabel: 'Built-in: Gemini 3.1 Flash Lite (Free Tier)',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    placeholderModel: 'gpt-4o / deepseek-coder / claude-sonnet-4-20250514',
  },
];

const PROTOCOL_LABELS: Record<ApiProviderProtocol, string> = {
  openai_compatible: 'OpenAI-Compatible',
  google_gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  huggingface: 'Hugging Face Inference',
  photoroom: 'PhotoRoom Official API',
  custom_rest: 'Custom REST JSON',
};

interface ProviderFormState {
  id?: string;
  name: string;
  category: ApiCapabilityCategory;
  providerType: ApiProviderProtocol;
  apiUrl: string;
  modelName: string;
  apiKey: string;
  clearApiKey: boolean;
  apiKeyEnvVar: string;
  authHeader: string;
  authPrefix: string;
  timeoutMs: number;
  extraHeadersJson: string;
  extraBodyJson: string;
  notes: string;
  enabled: boolean;
  existingMaskedKey?: string;
  existingHasKey?: boolean;
}

const EMPTY_FORM = (category: ApiCapabilityCategory = 'text'): ProviderFormState => {
  const meta = CATEGORY_META.find((c) => c.id === category) || CATEGORY_META[0];
  return {
    name: '',
    category,
    providerType: 'openai_compatible',
    apiUrl: meta.defaultUrl,
    modelName: '',
    apiKey: '',
    clearApiKey: false,
    apiKeyEnvVar: '',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    timeoutMs: 35000,
    extraHeadersJson: '',
    extraBodyJson: '',
    notes: '',
    enabled: true,
  };
};

export const ApiManagementSection: React.FC<ApiManagementSectionProps> = ({
  onConfigUpdated,
  onNotice,
}) => {
  const [providers, setProviders] = useState<SanitizedApiProviderEntry[]>([]);
  const [assignments, setAssignments] = useState<FeatureProviderAssignments>({
    text: 'built-in',
    image: 'built-in',
    image_edit: 'built-in',
    video: 'built-in',
    audio: 'built-in',
    code: 'built-in',
  });
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<'all' | ApiCapabilityCategory>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProviderFormState>(EMPTY_FORM('text'));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingDraft, setTestingDraft] = useState(false);
  const [draftTestResult, setDraftTestResult] = useState<ApiConnectionTestResult | null>(null);
  const [formError, setFormError] = useState('');

  // Dedicated Hugging Face Card State
  const hfProvider = providers.find((p) => p.id === 'hf-default' || p.providerType === 'huggingface');
  const [hfApiKey, setHfApiKey] = useState('');
  const [hfClearKey, setHfClearKey] = useState(false);
  const [hfCategory, setHfCategory] = useState<ApiCapabilityCategory>('image');
  const [hfModel, setHfModel] = useState('black-forest-labs/FLUX.1-schnell');
  const [hfCustomModel, setHfCustomModel] = useState('');
  const [hfApiUrl, setHfApiUrl] = useState('https://router.huggingface.co');
  const [hfSaving, setHfSaving] = useState(false);
  const [hfTesting, setHfTesting] = useState(false);
  const [hfErrorLog, setHfErrorLog] = useState('');

  // Dedicated PhotoRoom Card State
  const photoRoomProvider = providers.find((p) => p.id === 'photoroom-default' || p.providerType === 'photoroom');
  const [prApiKey, setPrApiKey] = useState('');
  const [prClearKey, setPrClearKey] = useState(false);
  const [prEndpoint, setPrEndpoint] = useState('https://image-api.photoroom.com/v2/edit');
  const [prSaving, setPrSaving] = useState(false);
  const [prTesting, setPrTesting] = useState(false);
  const [prErrorLog, setPrErrorLog] = useState('');

  useEffect(() => {
    if (hfProvider) {
      if (hfProvider.category) setHfCategory(hfProvider.category);
      if (hfProvider.modelName) {
        const standardHfModels = [
          'black-forest-labs/FLUX.1-schnell',
          'black-forest-labs/FLUX.1-dev',
          'stabilityai/stable-diffusion-3.5-large',
          'stabilityai/stable-diffusion-xl-base-1.0',
          'timbrooks/instruct-pix2pix',
        ];
        if (standardHfModels.includes(hfProvider.modelName)) {
          setHfModel(hfProvider.modelName);
        } else {
          setHfModel('custom');
          setHfCustomModel(hfProvider.modelName);
        }
      }
      if (hfProvider.apiUrl) setHfApiUrl(hfProvider.apiUrl);
      if (hfProvider.lastErrorLog) setHfErrorLog(hfProvider.lastErrorLog);
    }
  }, [hfProvider?.id, hfProvider?.category, hfProvider?.modelName, hfProvider?.apiUrl, hfProvider?.lastErrorLog]);

  useEffect(() => {
    if (photoRoomProvider) {
      if (photoRoomProvider.apiUrl) setPrEndpoint(photoRoomProvider.apiUrl);
      if (photoRoomProvider.lastErrorLog) setPrErrorLog(photoRoomProvider.lastErrorLog);
    }
  }, [photoRoomProvider?.id, photoRoomProvider?.apiUrl, photoRoomProvider?.lastErrorLog]);

  const loadApiManagement = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        if (data.featureAssignments) {
          setAssignments(data.featureAssignments);
        }
      }
    } catch {
      // handled cleanly by empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApiManagement();
  }, [loadApiManagement]);

  const applyPreset = (
    preset: 'openai_text' | 'gemini_paid' | 'anthropic_code' | 'openai_image_edit' | 'hf_image' | 'custom_video'
  ) => {
    setDraftTestResult(null);
    setFormError('');
    if (preset === 'openai_text') {
      setForm({
        ...EMPTY_FORM('text'),
        name: 'OpenAI GPT-4o',
        category: 'text',
        providerType: 'openai_compatible',
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        modelName: 'gpt-4o',
        apiKeyEnvVar: 'OPENAI_API_KEY',
      });
    } else if (preset === 'gemini_paid') {
      setForm({
        ...EMPTY_FORM('image'),
        name: 'Google Gemini Paid Image',
        category: 'image',
        providerType: 'google_gemini',
        apiUrl: 'https://generativelanguage.googleapis.com',
        modelName: 'gemini-3.1-flash-lite-image',
        apiKeyEnvVar: 'PAID_GEMINI_API_KEY',
      });
    } else if (preset === 'anthropic_code') {
      setForm({
        ...EMPTY_FORM('code'),
        name: 'Anthropic Claude Code',
        category: 'code',
        providerType: 'anthropic',
        apiUrl: 'https://api.anthropic.com/v1/messages',
        modelName: 'claude-sonnet-4-20250514',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        authHeader: 'x-api-key',
        authPrefix: '',
      });
    } else if (preset === 'openai_image_edit') {
      setForm({
        ...EMPTY_FORM('image_edit'),
        name: 'OpenAI Multi-Image Edit',
        category: 'image_edit',
        providerType: 'openai_compatible',
        apiUrl: 'https://api.openai.com/v1/images/edits',
        modelName: 'gpt-image-1',
        apiKeyEnvVar: 'OPENAI_API_KEY',
      });
    } else if (preset === 'hf_image') {
      setForm({
        ...EMPTY_FORM('image'),
        name: 'Hugging Face FLUX.1-dev',
        category: 'image',
        providerType: 'huggingface',
        apiUrl: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev',
        modelName: 'black-forest-labs/FLUX.1-dev',
        apiKeyEnvVar: 'HUGGINGFACE_API_KEY',
      });
    } else if (preset === 'custom_video') {
      setForm({
        ...EMPTY_FORM('video'),
        name: 'Custom Video AI API',
        category: 'video',
        providerType: 'custom_rest',
        apiUrl: 'https://api.example.com/v1/videos/generate',
        modelName: 'veo-3-fast',
      });
    }
  };

  const openAddForm = () => {
    const initialCat = filterCat === 'all' ? 'text' : filterCat;
    setForm(EMPTY_FORM(initialCat));
    setDraftTestResult(null);
    setFormError('');
    setShowAdvanced(false);
    setShowForm(true);
  };

  const openEditForm = (p: SanitizedApiProviderEntry) => {
    setForm({
      id: p.id,
      name: p.name,
      category: p.category,
      providerType: p.providerType,
      apiUrl: p.apiUrl,
      modelName: p.modelName,
      apiKey: '',
      clearApiKey: false,
      apiKeyEnvVar: p.apiKeyEnvVar || '',
      authHeader: p.authHeader || 'Authorization',
      authPrefix: p.authPrefix !== undefined ? p.authPrefix : 'Bearer ',
      timeoutMs: p.timeoutMs || 35000,
      extraHeadersJson: p.extraHeadersJson || '',
      extraBodyJson: p.extraBodyJson || '',
      notes: p.notes || '',
      enabled: p.enabled,
      existingMaskedKey: p.maskedKey,
      existingHasKey: p.hasApiKey,
    });
    setDraftTestResult(null);
    setFormError('');
    setShowAdvanced(!!(p.extraHeadersJson || p.extraBodyJson || p.authHeader !== 'Authorization'));
    setShowForm(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Provider name is required.');
      return;
    }
    if (!form.modelName.trim()) {
      setFormError('Model ID / Name is required.');
      return;
    }

    setSavingForm(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        category: form.category,
        providerType: form.providerType,
        apiUrl: form.apiUrl.trim(),
        modelName: form.modelName.trim(),
        apiKeyEnvVar: form.apiKeyEnvVar.trim(),
        authHeader: form.authHeader.trim() || 'Authorization',
        authPrefix: form.authPrefix,
        timeoutMs: Number(form.timeoutMs) || 35000,
        extraHeadersJson: form.extraHeadersJson.trim(),
        extraBodyJson: form.extraBodyJson.trim(),
        notes: form.notes.trim(),
        enabled: form.enabled,
      };
      if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
      if (form.clearApiKey) payload.clearApiKey = true;

      const endpoint = form.id
        ? `/api/admin/api-providers/${form.id}`
        : '/api/admin/api-providers';
      const method = form.id ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to save API provider.');
        return;
      }

      setProviders(data.providers || []);
      if (data.featureAssignments) setAssignments(data.featureAssignments);
      setShowForm(false);
      setForm(EMPTY_FORM('text'));
      onNotice(
        form.id
          ? `Updated "${data.provider?.name}" (API key stored securely on server).`
          : `Added "${data.provider?.name}" (API key stored securely on server).`
      );
      await onConfigUpdated();
    } catch {
      setFormError('Network error saving API provider.');
    } finally {
      setSavingForm(false);
    }
  };

  const handleTestDraft = async () => {
    setTestingDraft(true);
    setDraftTestResult(null);
    setFormError('');
    try {
      const res = await fetch('/api/admin/api-providers/test-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          category: form.category,
          providerType: form.providerType,
          apiUrl: form.apiUrl,
          modelName: form.modelName,
          apiKey: form.apiKey.trim() || undefined,
          apiKeyEnvVar: form.apiKeyEnvVar,
          authHeader: form.authHeader,
          authPrefix: form.authPrefix,
          timeoutMs: form.timeoutMs,
          extraHeadersJson: form.extraHeadersJson,
          extraBodyJson: form.extraBodyJson,
        }),
      });
      const data: ApiConnectionTestResult = await res.json();
      setDraftTestResult(data);
      if (form.id) await loadApiManagement();
    } catch {
      setDraftTestResult({
        connected: false,
        configured: false,
        category: form.category,
        modelName: form.modelName,
        latencyMs: 0,
        message: 'Network error testing API connection.',
      });
    } finally {
      setTestingDraft(false);
    }
  };

  const handleTestSavedProvider = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/admin/api-providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.providers) {
        setProviders(data.providers);
      } else {
        await loadApiManagement();
      }
      onNotice(
        data.connected
          ? `Connection successful: ${data.message}`
          : `Connection failed: ${data.message}`
      );
    } catch {
      onNotice('Network error while testing API provider.');
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleEnabled = async (p: SanitizedApiProviderEntry) => {
    const res = await fetch(`/api/admin/api-providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    const data = await res.json();
    if (res.ok && data.providers) {
      setProviders(data.providers);
      onNotice(`"${p.name}" ${!p.enabled ? 'enabled' : 'disabled'}.`);
      await onConfigUpdated();
    }
  };

  const handleDeleteProvider = async (p: SanitizedApiProviderEntry) => {
    const res = await fetch(`/api/admin/api-providers/${p.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setProviders(data.providers || []);
      if (data.featureAssignments) setAssignments(data.featureAssignments);
      onNotice(`Deleted API provider "${p.name}" and purged server secret.`);
      await onConfigUpdated();
    }
  };

  const handleSaveAssignments = async (nextAssignments: FeatureProviderAssignments) => {
    setAssignments(nextAssignments);
    setSavingAssignments(true);
    try {
      const res = await fetch('/api/admin/feature-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextAssignments),
      });
      const data = await res.json();
      if (res.ok && data.featureAssignments) {
        setAssignments(data.featureAssignments);
        onNotice('Feature-to-model routing updated.');
        await onConfigUpdated();
      }
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleSaveHfCard = async () => {
    setHfSaving(true);
    setHfErrorLog('');
    try {
      const activeModel =
        hfModel === 'custom' ? hfCustomModel.trim() || 'black-forest-labs/FLUX.1-schnell' : hfModel;
      const targetId = hfProvider?.id || 'hf-default';
      const payload: Record<string, any> = {
        name: 'Hugging Face',
        category: hfCategory,
        providerType: 'huggingface',
        apiUrl: hfApiUrl.trim() || 'https://router.huggingface.co',
        modelName: activeModel,
        apiKeyEnvVar: 'HF_TOKEN',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        timeoutMs: 45000,
        notes: 'Hugging Face Inference Router for image generation & editing models.',
        enabled: hfProvider?.enabled ?? true,
      };
      if (hfApiKey.trim()) payload.apiKey = hfApiKey.trim();
      if (hfClearKey) payload.clearApiKey = true;

      const endpoint = hfProvider ? `/api/admin/api-providers/${targetId}` : '/api/admin/api-providers';
      const method = hfProvider ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setHfErrorLog(data.error || 'Failed to save Hugging Face settings.');
        onNotice(data.error || 'Failed to save Hugging Face configuration.');
        return;
      }
      setProviders(data.providers || []);
      if (data.featureAssignments) setAssignments(data.featureAssignments);
      setHfApiKey('');
      setHfClearKey(false);
      onNotice('Hugging Face configuration saved successfully.');
      await onConfigUpdated();
    } catch (err: any) {
      setHfErrorLog(err?.message || 'Network error saving Hugging Face settings.');
    } finally {
      setHfSaving(false);
    }
  };

  const handleTestHfCard = async () => {
    setHfTesting(true);
    try {
      const activeModel =
        hfModel === 'custom' ? hfCustomModel.trim() || 'black-forest-labs/FLUX.1-schnell' : hfModel;
      const body = {
        id: hfProvider?.id,
        name: 'Hugging Face',
        category: hfCategory,
        providerType: 'huggingface',
        apiUrl: hfApiUrl.trim() || 'https://router.huggingface.co',
        modelName: activeModel,
        apiKeyEnvVar: 'HF_TOKEN',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        timeoutMs: 45000,
        apiKey: hfApiKey.trim() || undefined,
      };
      const res = await fetch('/api/admin/api-providers/test-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.connected) {
        setHfErrorLog('');
        onNotice(`Hugging Face Connected: ${data.message}`);
      } else {
        const errMsg = `[${new Date().toLocaleTimeString()}] ${data.message}`;
        setHfErrorLog(errMsg);
        onNotice(`Hugging Face Test Failed: ${data.message}`);
      }
      await loadApiManagement();
    } catch (err: any) {
      setHfErrorLog(`[${new Date().toLocaleTimeString()}] Network error: ${err?.message || 'Failed to test'}`);
    } finally {
      setHfTesting(false);
    }
  };

  const handleToggleHfEnabled = async () => {
    if (!hfProvider) return;
    await handleToggleEnabled(hfProvider);
  };

  const handleSavePhotoRoomCard = async () => {
    setPrSaving(true);
    setPrErrorLog('');
    try {
      const targetId = photoRoomProvider?.id || 'photoroom-default';
      const payload: Record<string, any> = {
        name: 'PhotoRoom',
        category: 'image_edit',
        providerType: 'photoroom',
        apiUrl: prEndpoint.trim() || 'https://image-api.photoroom.com/v2/edit',
        modelName: 'photoroom-v2-edit',
        apiKeyEnvVar: 'PHOTOROOM_API_KEY',
        authHeader: 'x-api-key',
        authPrefix: '',
        timeoutMs: 35000,
        notes: 'PhotoRoom official API for background removal and prompt-based scene editing.',
        enabled: photoRoomProvider?.enabled ?? true,
      };
      if (prApiKey.trim()) payload.apiKey = prApiKey.trim();
      if (prClearKey) payload.clearApiKey = true;

      const endpoint = photoRoomProvider ? `/api/admin/api-providers/${targetId}` : '/api/admin/api-providers';
      const method = photoRoomProvider ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setPrErrorLog(data.error || 'Failed to save PhotoRoom settings.');
        onNotice(data.error || 'Failed to save PhotoRoom configuration.');
        return;
      }
      setProviders(data.providers || []);
      if (data.featureAssignments) setAssignments(data.featureAssignments);
      setPrApiKey('');
      setPrClearKey(false);
      onNotice('PhotoRoom configuration saved successfully.');
      await onConfigUpdated();
    } catch (err: any) {
      setPrErrorLog(err?.message || 'Network error saving PhotoRoom settings.');
    } finally {
      setPrSaving(false);
    }
  };

  const handleTestPhotoRoomCard = async () => {
    setPrTesting(true);
    try {
      const body = {
        id: photoRoomProvider?.id,
        name: 'PhotoRoom',
        category: 'image_edit',
        providerType: 'photoroom',
        apiUrl: prEndpoint.trim() || 'https://image-api.photoroom.com/v2/edit',
        modelName: 'photoroom-v2-edit',
        apiKeyEnvVar: 'PHOTOROOM_API_KEY',
        authHeader: 'x-api-key',
        authPrefix: '',
        timeoutMs: 35000,
        apiKey: prApiKey.trim() || undefined,
      };
      const res = await fetch('/api/admin/api-providers/test-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.connected) {
        setPrErrorLog('');
        onNotice(`PhotoRoom Connected: ${data.message}`);
      } else {
        const errMsg = `[${new Date().toLocaleTimeString()}] ${data.message}`;
        setPrErrorLog(errMsg);
        onNotice(`PhotoRoom Test Failed: ${data.message}`);
      }
      await loadApiManagement();
    } catch (err: any) {
      setPrErrorLog(`[${new Date().toLocaleTimeString()}] Network error: ${err?.message || 'Failed to test'}`);
    } finally {
      setPrTesting(false);
    }
  };

  const handleTogglePhotoRoomEnabled = async () => {
    if (!photoRoomProvider) return;
    await handleToggleEnabled(photoRoomProvider);
  };

  const visibleProviders = (filterCat === 'all'
    ? providers
    : providers.filter((p) => p.category === filterCat)
  ).filter((p) => p.id !== 'hf-default' && p.id !== 'photoroom-default');

  return (
    <div className="space-y-6">
      {/* Header & Security Guarantee */}
      <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              AI Model API Management
            </h3>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            Add, edit, test, and assign paid or custom AI APIs per feature without changing code. Existing free-tier features continue working safely whenever a feature uses Built-in Default.
          </p>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              Security: API keys are stored strictly in protected server-side secrets/env and are never returned to browsers or local storage.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add AI API</span>
        </button>
      </div>

      {/* Add / Edit API Form */}
      {showForm && (
        <form
          onSubmit={handleSaveProvider}
          className="p-4 sm:p-5 rounded-2xl bg-[#0B1020] border border-blue-500/40 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white">
              {form.id ? `Edit Provider: ${form.name}` : 'Connect New AI Model API'}
            </h4>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-[#11192E]"
            >
              Cancel
            </button>
          </div>

          {!form.id && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Quick Templates
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'openai_text', label: 'OpenAI GPT-4o (Text)' },
                  { id: 'gemini_paid', label: 'Google Gemini Paid (Image)' },
                  { id: 'anthropic_code', label: 'Anthropic Claude (Code)' },
                  { id: 'openai_image_edit', label: 'OpenAI Multi-Image Edit' },
                  { id: 'hf_image', label: 'Hugging Face Flux (Image)' },
                  { id: 'custom_video', label: 'Custom Video API' },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyPreset(tpl.id as any)}
                    className="px-2.5 py-1 rounded-lg bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-200 transition"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formError && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-200">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Feature Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = e.target.value as ApiCapabilityCategory;
                  const meta = CATEGORY_META.find((c) => c.id === cat);
                  setForm((prev) => ({
                    ...prev,
                    category: cat,
                    apiUrl: !prev.id && meta ? meta.defaultUrl : prev.apiUrl,
                  }));
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
              >
                {CATEGORY_META.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">API Protocol</label>
              <select
                value={form.providerType}
                onChange={(e) => {
                  const pt = e.target.value as ApiProviderProtocol;
                  setForm((prev) => ({
                    ...prev,
                    providerType: pt,
                    authHeader: pt === 'anthropic' ? 'x-api-key' : 'Authorization',
                    authPrefix: pt === 'anthropic' ? '' : 'Bearer ',
                  }));
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
              >
                {Object.entries(PROTOCOL_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Provider Display Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. OpenAI GPT-4o / Paid Gemini"
                className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-300 mb-1">API Endpoint URL</label>
              <input
                type="text"
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                placeholder="https://api.openai.com/v1/chat/completions"
                className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400 font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">Model ID / Name</label>
              <input
                type="text"
                value={form.modelName}
                onChange={(e) => setForm({ ...form, modelName: e.target.value })}
                placeholder={
                  CATEGORY_META.find((c) => c.id === form.category)?.placeholderModel || 'model-id'
                }
                className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-300 mb-1">
                API Key (Write-Only Server Secret){' '}
                {form.existingHasKey && !form.clearApiKey && (
                  <span className="text-emerald-400 font-mono">
                    · Stored ({form.existingMaskedKey})
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value, clearApiKey: false })}
                  placeholder={
                    form.existingHasKey
                      ? 'Leave blank to keep stored server key, or paste new key'
                      : 'sk-... (stored strictly on server)'
                  }
                  className="flex-1 px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400"
                />
                {form.id && form.existingHasKey && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, apiKey: '', clearApiKey: !form.clearApiKey })}
                    className={`px-3 py-2 rounded-xl border text-[11px] font-semibold shrink-0 ${
                      form.clearApiKey
                        ? 'bg-red-500/20 border-red-500/50 text-red-200'
                        : 'bg-[#11192E] border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {form.clearApiKey ? 'Will Clear Key' : 'Clear Key'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">
                Server Env Var Name (Optional)
              </label>
              <input
                type="text"
                value={form.apiKeyEnvVar}
                onChange={(e) => setForm({ ...form, apiKeyEnvVar: e.target.value })}
                placeholder="e.g. OPENAI_API_KEY"
                className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white placeholder:text-slate-400 font-mono"
              />
            </div>
          </div>

          {/* Advanced Auth / Headers / Body */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white font-medium"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>Advanced Auth Headers, Timeout & Extra Parameters</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Auth Header</label>
                  <input
                    type="text"
                    value={form.authHeader}
                    onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Auth Prefix</label>
                  <input
                    type="text"
                    value={form.authPrefix}
                    onChange={(e) => setForm({ ...form, authPrefix: e.target.value })}
                    placeholder="Bearer "
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    min={3000}
                    max={240000}
                    value={form.timeoutMs}
                    onChange={(e) => setForm({ ...form, timeoutMs: parseInt(e.target.value || '35000', 10) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white font-mono"
                  />
                </div>
                <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-300 mb-1">Extra Headers (JSON)</label>
                    <input
                      type="text"
                      value={form.extraHeadersJson}
                      onChange={(e) => setForm({ ...form, extraHeadersJson: e.target.value })}
                      placeholder='{"anthropic-version":"2023-06-01"}'
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white font-mono placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-300 mb-1">Extra Request Params (JSON)</label>
                    <input
                      type="text"
                      value={form.extraBodyJson}
                      onChange={(e) => setForm({ ...form, extraBodyJson: e.target.value })}
                      placeholder='{"temperature":0.7}'
                      className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white font-mono placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-500"
            />
            <span>Enable this API provider immediately</span>
          </label>

          {draftTestResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                draftTestResult.connected
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
                  : 'bg-red-500/15 border border-red-500/40 text-red-200'
              }`}
            >
              {draftTestResult.connected ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              )}
              <span>{draftTestResult.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleTestDraft}
              disabled={testingDraft}
              className="px-4 py-2 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingDraft ? 'animate-spin' : ''}`} />
              <span>{testingDraft ? 'Testing Connection...' : 'Test Connection'}</span>
            </button>
            <button
              type="submit"
              disabled={savingForm}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingForm ? 'Saving...' : form.id ? 'Update API Provider' : 'Save API Provider'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Dedicated Image AI Provider Cards: Hugging Face & PhotoRoom */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white tracking-wide">
              Featured Image AI Providers
            </h4>
          </div>
          <span className="text-xs text-slate-400">
            Hugging Face Router &amp; PhotoRoom Image Editing
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 1: Hugging Face */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-4 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🤗</span>
                    <h5 className="text-sm font-bold text-white">Hugging Face</h5>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-300">
                      Inference Router
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Base URL: <span className="text-slate-300">https://router.huggingface.co</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer" title="Enable or disable Hugging Face">
                    <input
                      type="checkbox"
                      checked={hfProvider?.enabled ?? false}
                      onChange={handleToggleHfEnabled}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                  <span className={`text-[11px] font-semibold ${hfProvider?.enabled ? 'text-blue-400' : 'text-slate-500'}`}>
                    {hfProvider?.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {hfProvider?.lastTestStatus === 'connected' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{hfProvider.lastTestMessage || 'Connected'}</span>
                    {hfProvider.lastTestLatencyMs ? <span className="font-mono">({hfProvider.lastTestLatencyMs}ms)</span> : null}
                  </span>
                ) : hfProvider?.lastTestStatus === 'failed' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Connection Failed</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-xs">
                    <Plug className="w-3.5 h-3.5 text-slate-400" />
                    <span>Untested</span>
                  </span>
                )}
              </div>

              {/* API Key Configuration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-300">
                    HF_TOKEN <span className="text-slate-400 font-normal">(Server-side Secret)</span>
                  </label>
                  {hfProvider?.hasApiKey && !hfClearKey && (
                    <span className="text-[11px] font-mono text-emerald-400">
                      Active: {hfProvider.maskedKey} ({hfProvider.keySource === 'env' ? 'HF_TOKEN env' : 'Server Vault'})
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={hfApiKey}
                    onChange={(e) => {
                      setHfApiKey(e.target.value);
                      setHfClearKey(false);
                    }}
                    placeholder={
                      hfProvider?.hasApiKey
                        ? 'Leave blank to keep stored HF_TOKEN, or paste new token'
                        : 'hf_... (stored strictly on server)'
                    }
                    className="flex-1 px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white placeholder:text-slate-400 font-mono"
                  />
                  {hfProvider?.hasApiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setHfClearKey(!hfClearKey);
                        setHfApiKey('');
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold shrink-0 ${
                        hfClearKey
                          ? 'bg-red-500/20 border-red-500/50 text-red-200'
                          : 'bg-[#11192E] border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {hfClearKey ? 'Will Clear Key' : 'Clear Key'}
                    </button>
                  )}
                </div>
              </div>

              {/* Task & Model Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Configured Task</label>
                  <select
                    value={hfCategory}
                    onChange={(e) => setHfCategory(e.target.value as ApiCapabilityCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white"
                  >
                    <option value="image">Image Generation (Text-to-Image)</option>
                    <option value="image_edit">Photo &amp; Multi-Image Editing</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Model Selection</label>
                  <select
                    value={hfModel}
                    onChange={(e) => setHfModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-white font-mono"
                  >
                    <option value="black-forest-labs/FLUX.1-schnell">FLUX.1-schnell (Fast 4-Step)</option>
                    <option value="black-forest-labs/FLUX.1-dev">FLUX.1-dev (Ultra-Detailed)</option>
                    <option value="stabilityai/stable-diffusion-3.5-large">Stable Diffusion 3.5 Large</option>
                    <option value="stabilityai/stable-diffusion-xl-base-1.0">SDXL Base 1.0</option>
                    <option value="timbrooks/instruct-pix2pix">timbrooks/instruct-pix2pix (Edit)</option>
                    <option value="custom">Custom Hugging Face Repo...</option>
                  </select>
                </div>
              </div>

              {hfModel === 'custom' && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1 text-xs">Custom Hugging Face Model ID</label>
                  <input
                    type="text"
                    value={hfCustomModel}
                    onChange={(e) => setHfCustomModel(e.target.value)}
                    placeholder="e.g. Qwen/Qwen-Image-Gen or your-org/fine-tuned-flux"
                    className="w-full px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white font-mono placeholder:text-slate-500"
                  />
                </div>
              )}

              {/* Error Logs Box */}
              {(hfErrorLog || hfProvider?.lastErrorLog) && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 space-y-1.5 text-xs text-red-200">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      Hugging Face Error Log
                    </span>
                    <button
                      type="button"
                      onClick={() => setHfErrorLog('')}
                      className="text-[10px] text-red-400 hover:text-red-200 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                  <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-red-300 bg-[#0B1020] p-2 rounded-lg border border-red-900/50">
                    {hfErrorLog || hfProvider?.lastErrorLog}
                  </pre>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestHfCard}
                  disabled={hfTesting}
                  className="px-3.5 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${hfTesting ? 'animate-spin' : ''}`} />
                  <span>{hfTesting ? 'Testing...' : 'Test Connection'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveHfCard}
                  disabled={hfSaving}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{hfSaving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>

              {hfProvider?.enabled && assignments[hfCategory] !== hfProvider.id && (
                <button
                  type="button"
                  onClick={() => handleSaveAssignments({ ...assignments, [hfCategory]: hfProvider.id })}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 text-xs font-semibold"
                >
                  Set as Active {hfCategory === 'image' ? 'Image' : 'Edit'} Model
                </button>
              )}
            </div>
          </div>

          {/* Card 2: PhotoRoom */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-4 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🪄</span>
                    <h5 className="text-sm font-bold text-white">PhotoRoom</h5>
                    <a
                      href="https://docs.photoroom.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-[11px] font-semibold text-purple-300 hover:underline"
                    >
                      <span>Official API Docs</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Endpoint: <span className="text-slate-300">https://image-api.photoroom.com/v2/edit</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer" title="Enable or disable PhotoRoom">
                    <input
                      type="checkbox"
                      checked={photoRoomProvider?.enabled ?? false}
                      onChange={handleTogglePhotoRoomEnabled}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                  <span className={`text-[11px] font-semibold ${photoRoomProvider?.enabled ? 'text-purple-400' : 'text-slate-500'}`}>
                    {photoRoomProvider?.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {photoRoomProvider?.lastTestStatus === 'connected' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{photoRoomProvider.lastTestMessage || 'Connected'}</span>
                    {photoRoomProvider.lastTestLatencyMs ? <span className="font-mono">({photoRoomProvider.lastTestLatencyMs}ms)</span> : null}
                  </span>
                ) : photoRoomProvider?.lastTestStatus === 'failed' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Connection Failed</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-xs">
                    <Plug className="w-3.5 h-3.5 text-slate-400" />
                    <span>Untested</span>
                  </span>
                )}
              </div>

              {/* API Key Configuration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-300">
                    PHOTOROOM_API_KEY <span className="text-slate-400 font-normal">(Server-side Secret)</span>
                  </label>
                  {photoRoomProvider?.hasApiKey && !prClearKey && (
                    <span className="text-[11px] font-mono text-emerald-400">
                      Active: {photoRoomProvider.maskedKey} ({photoRoomProvider.keySource === 'env' ? 'PHOTOROOM_API_KEY env' : 'Server Vault'})
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={prApiKey}
                    onChange={(e) => {
                      setPrApiKey(e.target.value);
                      setPrClearKey(false);
                    }}
                    placeholder={
                      photoRoomProvider?.hasApiKey
                        ? 'Leave blank to keep stored PHOTOROOM_API_KEY, or paste new key'
                        : 'sandbox_... or live key (stored strictly on server)'
                    }
                    className="flex-1 px-3 py-2 rounded-xl bg-[#11192E] border border-slate-700 text-xs text-white placeholder:text-slate-400 font-mono"
                  />
                  {photoRoomProvider?.hasApiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setPrClearKey(!prClearKey);
                        setPrApiKey('');
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold shrink-0 ${
                        prClearKey
                          ? 'bg-red-500/20 border-red-500/50 text-red-200'
                          : 'bg-[#11192E] border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {prClearKey ? 'Will Clear Key' : 'Clear Key'}
                    </button>
                  )}
                </div>
              </div>

              {/* Supported Features & Capabilities */}
              <div className="space-y-2 text-xs">
                <label className="block font-semibold text-slate-300">Supported PhotoRoom Capabilities</label>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-200">
                    ✂️ Background Removal (Cutout)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-200">
                    🌅 AI Scene Prompts (background.prompt)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-200">
                    🎨 Solid Background Colors
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-200">
                    ✨ HD Studio Relight &amp; Shadows
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  PhotoRoom specializes in cutout, background removal, and studio scene synthesis. For arbitrary text-to-image or multi-person compositions, MY AI automatically uses multi-image models with natural fallback.
                </p>
              </div>

              {/* Error Logs Box */}
              {(prErrorLog || photoRoomProvider?.lastErrorLog) && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 space-y-1.5 text-xs text-red-200">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      PhotoRoom Error Log
                    </span>
                    <button
                      type="button"
                      onClick={() => setPrErrorLog('')}
                      className="text-[10px] text-red-400 hover:text-red-200 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                  <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-red-300 bg-[#0B1020] p-2 rounded-lg border border-red-900/50">
                    {prErrorLog || photoRoomProvider?.lastErrorLog}
                  </pre>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestPhotoRoomCard}
                  disabled={prTesting}
                  className="px-3.5 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${prTesting ? 'animate-spin' : ''}`} />
                  <span>{prTesting ? 'Testing...' : 'Test Connection'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSavePhotoRoomCard}
                  disabled={prSaving}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{prSaving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>

              {photoRoomProvider?.enabled && assignments.image_edit !== photoRoomProvider.id && (
                <button
                  type="button"
                  onClick={() => handleSaveAssignments({ ...assignments, image_edit: photoRoomProvider.id })}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 text-xs font-semibold"
                >
                  Set as Active Image Edit Provider
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feature-to-Model Routing Matrix (All 6 Categories) */}
      <div className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-white">Active Model per Feature</h4>
            <p className="text-xs text-slate-300">
              Choose which AI provider &amp; model MY AI uses automatically for each capability.
            </p>
          </div>
          {savingAssignments && (
            <span className="text-xs text-blue-300 font-medium">Saving routing...</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CATEGORY_META.map((cat) => {
            const matching = providers.filter((p) => p.category === cat.id);
            const selectedVal = assignments[cat.id] || 'built-in';
            const selectedProvider = matching.find((p) => p.id === selectedVal);
            const hasWarning =
              selectedVal !== 'built-in' &&
              (!selectedProvider || !selectedProvider.enabled || !selectedProvider.hasApiKey);

            return (
              <div
                key={cat.id}
                className="p-3 rounded-xl bg-[#11192E] border border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{cat.label}</span>
                  {selectedVal === 'built-in' ? (
                    <span className="text-[11px] text-emerald-300 font-medium">Built-in Active</span>
                  ) : hasWarning ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      {!selectedProvider?.enabled ? 'Disabled' : 'Key Missing'}
                    </span>
                  ) : selectedProvider?.lastTestStatus === 'connected' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[11px] text-blue-300 font-medium">Custom Active</span>
                  )}
                </div>

                <select
                  value={selectedVal}
                  onChange={(e) =>
                    handleSaveAssignments({
                      ...assignments,
                      [cat.id]: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0B1020] border border-slate-700 text-xs text-white"
                >
                  <option value="built-in">{cat.builtInLabel}</option>
                  {matching.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.modelName}){!p.enabled ? ' [Disabled]' : !p.hasApiKey ? ' [No Key]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Filter + Saved API Providers List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Configured AI Providers ({visibleProviders.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilterCat('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                filterCat === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#11192E] text-slate-300 border border-slate-700 hover:text-white'
              }`}
            >
              All ({providers.length})
            </button>
            {CATEGORY_META.map((c) => {
              const count = providers.filter((p) => p.category === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilterCat(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                    filterCat === c.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#11192E] text-slate-300 border border-slate-700 hover:text-white'
                  }`}
                >
                  {c.label.replace(' API', '')} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-300 bg-[#0B1020] border border-slate-800 rounded-2xl">
            Loading API providers...
          </div>
        ) : visibleProviders.length === 0 ? (
          <div className="p-6 text-center space-y-2 bg-[#0B1020] border border-slate-800 rounded-2xl">
            <Plug className="w-6 h-6 text-slate-400 mx-auto" />
            <div className="text-xs font-semibold text-white">
              No custom API providers configured in this category yet.
            </div>
            <p className="text-xs text-slate-300 max-w-md mx-auto">
              All built-in MY AI features remain active. Click &ldquo;Add AI API&rdquo; whenever you want to connect a paid or external Text, Image, Multi-Image Edit, Video, Music, or Code API.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleProviders.map((p) => {
              const catLabel = CATEGORY_META.find((c) => c.id === p.category)?.label || p.category;
              const isAssigned = assignments[p.category] === p.id;
              return (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl bg-[#0B1020] border border-slate-800 space-y-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">{p.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-[11px] font-semibold text-blue-300">
                          {catLabel}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#11192E] border border-slate-700 text-[11px] text-slate-300">
                          {PROTOCOL_LABELS[p.providerType]}
                        </span>
                        {isAssigned && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
                            Assigned Active
                          </span>
                        )}
                        {!p.enabled && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-400">
                            Disabled
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-300 font-mono truncate">
                        Model: <span className="text-white">{p.modelName}</span> · URL:{' '}
                        <span>{p.apiUrl || '(Provider Default)'}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        <span className={p.hasApiKey ? 'text-emerald-300' : 'text-amber-300'}>
                          Secret:{' '}
                          {p.hasApiKey
                            ? p.keySource === 'env'
                              ? `Env (${p.apiKeyEnvVar}) · ${p.maskedKey}`
                              : `Server Vault · ${p.maskedKey}`
                            : 'Not Configured'}
                        </span>

                        {p.lastTestStatus === 'connected' && (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Connected
                            {p.lastTestLatencyMs ? ` (${p.lastTestLatencyMs}ms)` : ''}
                          </span>
                        )}
                        {p.lastTestStatus === 'failed' && (
                          <span className="inline-flex items-center gap-1 text-red-300">
                            <XCircle className="w-3.5 h-3.5" />
                            Test Failed
                          </span>
                        )}
                        {p.lastTestStatus === 'untested' && (
                          <span className="text-slate-400">Not tested yet</span>
                        )}
                      </div>

                      {p.lastTestMessage && (
                        <div className="text-[11px] text-slate-300 bg-[#11192E] px-2.5 py-1.5 rounded-lg border border-slate-800">
                          {p.lastTestMessage}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTestSavedProvider(p.id)}
                        disabled={testingId === p.id}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${testingId === p.id ? 'animate-spin' : ''}`} />
                        <span>{testingId === p.id ? 'Testing...' : 'Test'}</span>
                      </button>

                      {p.enabled && !isAssigned && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveAssignments({ ...assignments, [p.category]: p.id })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 text-xs font-semibold"
                        >
                          Set Active
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(p)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
                        title={p.enabled ? 'Disable provider' : 'Enable provider'}
                      >
                        <Power className="w-3 h-3" />
                        <span>{p.enabled ? 'Disable' : 'Enable'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(p)}
                        className="p-1.5 rounded-xl bg-[#11192E] hover:bg-slate-800 border border-slate-700 text-slate-200"
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteProvider(p)}
                        className="p-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300"
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
