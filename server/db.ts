import fs from 'fs';
import path from 'path';
import {
  ChatConversation,
  ChatMessage,
  UserAccount,
  AIModelConfig,
  GenerationJob,
  SystemStats,
  NotebookItem,
  FeedbackEntry,
  PublicLinkItem,
  UserPreferences,
  ApiCapabilityCategory,
  ApiProviderProtocol,
  SanitizedApiProviderEntry,
  FeatureProviderAssignments,
  SubscriptionPlan,
  PaymentSettings,
  PaymentOrder,
  PaymentTransaction,
  UserSubscription,
} from '../src/types.js';
import {
  setProviderSecret,
  deleteProviderSecret,
  getProviderSecretStatus,
  resolveProviderSecret,
} from './secrets.js';

export interface ApiProviderRecord {
  id: string;
  name: string;
  category: ApiCapabilityCategory;
  providerType: ApiProviderProtocol;
  apiUrl: string;
  modelName: string;
  apiKeyEnvVar?: string;
  authHeader?: string;
  authPrefix?: string;
  timeoutMs?: number;
  extraHeadersJson?: string;
  extraBodyJson?: string;
  notes?: string;
  enabled: boolean;
  lastTestStatus: 'untested' | 'connected' | 'failed';
  lastTestedAt?: number;
  lastTestLatencyMs?: number;
  lastTestMessage?: string;
  lastErrorLog?: string;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_FEATURE_ASSIGNMENTS: FeatureProviderAssignments = {
  text: 'built-in',
  image: 'built-in',
  image_edit: 'built-in',
  video: 'built-in',
  audio: 'built-in',
  code: 'built-in',
};

const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);

const BUNDLED_DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_DIR = isServerless ? path.join('/tmp', 'myai_data') : BUNDLED_DATA_DIR;
const DB_FILE = path.join(DATA_DIR, 'myai_store.json');
const BUNDLED_DB_FILE = path.join(BUNDLED_DATA_DIR, 'myai_store.json');

export interface ServerProviderSecrets {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  customImageEndpoint: string;
  customImageKey: string;
  customVideoEndpoint: string;
  customVideoKey: string;
  customAudioEndpoint: string;
  customAudioKey: string;
  geminiOverrideKey: string;
  enableAutoRouting: boolean;
  freeTierDailyImageLimit: number;
  freeTierDailyVideoLimit: number;
  freeTierDailyAudioLimit: number;
  proTierDailyImageLimit: number;
  proTierDailyVideoLimit: number;
  proTierDailyAudioLimit: number;
  safetyLevel: 'standard' | 'strict' | 'relaxed';
  siteName: string;
  announcementBanner: string;
  maintenanceMode: boolean;
}

export interface DatabaseSchema {
  schemaVersion?: number;
  users: UserAccount[];
  chats: ChatConversation[];
  messages: Record<string, ChatMessage[]>;
  jobs: GenerationJob[];
  models: AIModelConfig[];
  notebooks: NotebookItem[];
  feedback: FeedbackEntry[];
  publicLinks: PublicLinkItem[];
  apiProviders?: ApiProviderRecord[];
  featureAssignments?: FeatureProviderAssignments;
  subscriptionPlans?: SubscriptionPlan[];
  paymentSettings?: PaymentSettings;
  paymentOrders?: PaymentOrder[];
  paymentTransactions?: PaymentTransaction[];
  userSubscriptions?: UserSubscription[];
  config: ServerProviderSecrets;
  stats: SystemStats;
}

const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_free',
    name: 'Free Starter',
    title: 'Essential AI for everyday use',
    description: 'Access Gemini 3.1 Flash Lite, standard FLUX image gen, and basic tools.',
    priceINR: 0,
    billingCycle: 'free',
    durationDays: 0,
    durationLabel: 'Free Forever',
    tier: 'Free',
    features: [
      '15 AI photo generations per day',
      '3 video generations per day (720p)',
      '5 AI audio & song generations per day',
      '100 chat messages per day',
      'Standard model speed & standard support',
    ],
    limits: {
      imagesQuota: 15,
      videosQuota: 3,
      audioQuota: 5,
      chatsQuota: 100,
    },
    enabled: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 1,
    createdAt: Date.now() - 30 * 24 * 3600 * 1000,
    updatedAt: Date.now() - 30 * 24 * 3600 * 1000,
  },
  {
    id: 'plan_pro_monthly',
    name: 'Pro Creator (Monthly)',
    title: 'Powerful AI for creators & professionals',
    description: 'Unlock 4K media, Hugging Face FLUX & PhotoRoom editing, and priority queue.',
    priceINR: 499,
    billingCycle: 'monthly',
    durationDays: 30,
    durationLabel: 'Month',
    tier: 'Pro',
    features: [
      '250 AI photo generations per month',
      '50 high-res video generations (1080p)',
      '60 AI audio & musical track generations',
      '1,000 deep chat & coding queries',
      'Full Hugging Face FLUX & PhotoRoom AI editing',
      'Subject preservation & multi-photo composition',
      'Priority generation queue & 2x processing speed',
    ],
    limits: {
      imagesQuota: 250,
      videosQuota: 50,
      audioQuota: 60,
      chatsQuota: 1000,
    },
    enabled: true,
    isPopular: true,
    isRecommended: false,
    sortOrder: 2,
    createdAt: Date.now() - 20 * 24 * 3600 * 1000,
    updatedAt: Date.now() - 20 * 24 * 3600 * 1000,
  },
  {
    id: 'plan_pro_yearly',
    name: 'Pro Creator (Yearly)',
    title: 'Best Value · Save 20% on annual billing',
    description: 'Full year of unlimited Pro creation power with maximum quota.',
    priceINR: 4999,
    billingCycle: 'yearly',
    durationDays: 365,
    durationLabel: 'Year',
    tier: 'Pro',
    features: [
      'All Pro Creator features included',
      '3,500 AI photo generations per year',
      '700 video generations (1080p & 4K)',
      '800 musical track & speech generations',
      'Full Hugging Face + PhotoRoom priority routing',
      'VIP Priority Support & Early Beta feature access',
    ],
    limits: {
      imagesQuota: 3500,
      videosQuota: 700,
      audioQuota: 800,
      chatsQuota: 15000,
    },
    enabled: true,
    isPopular: false,
    isRecommended: true,
    sortOrder: 3,
    createdAt: Date.now() - 15 * 24 * 3600 * 1000,
    updatedAt: Date.now() - 15 * 24 * 3600 * 1000,
  },
  {
    id: 'plan_enterprise',
    name: 'Super AI Enterprise',
    title: 'Unlimited creative studio for teams & studios',
    description: 'Maximum concurrency, Gemini 4 Argon, custom model routing & unlimited quotas.',
    priceINR: 9999,
    billingCycle: 'yearly',
    durationDays: 365,
    durationLabel: 'Year',
    tier: 'Enterprise',
    features: [
      'Unlimited multimodal chat & coding reasoning',
      '10,000 AI photo generations',
      '2,000 cinematic video generations',
      '2,000 Lyria music & audio generations',
      'Dedicated API endpoints & high concurrency',
      'Custom model weights and fine-tuning support',
      '24/7 dedicated support engineer',
    ],
    limits: {
      imagesQuota: 10000,
      videosQuota: 2000,
      audioQuota: 2000,
      chatsQuota: 99999,
    },
    enabled: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 4,
    createdAt: Date.now() - 10 * 24 * 3600 * 1000,
    updatedAt: Date.now() - 10 * 24 * 3600 * 1000,
  },
];

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  upiQr: {
    enabled: true,
    qrImageUrl: '',
    upiId: 'myai@icici',
    accountHolderName: 'MY AI Technologies',
    instructions:
      'Scan the QR code using any UPI app (GPay, PhonePe, Paytm, BHIM) and submit your 12-digit transaction UTR / Reference ID below.',
  },
  upiId: {
    enabled: true,
    upiId: 'myai@icici',
    accountHolderName: 'MY AI Technologies',
    instructions:
      'Copy the official UPI ID above, transfer the exact plan amount from your bank or UPI app, and enter the transaction reference / UTR below.',
  },
  bankTransfer: {
    enabled: true,
    accountHolderName: 'MY AI Technologies Pvt Ltd',
    bankName: 'HDFC Bank',
    accountNumber: '50200088991122',
    ifscCode: 'HDFC0001234',
    branchName: 'Koramangala Branch, Bengaluru',
    instructions:
      'Transfer the amount via IMPS / NEFT / RTGS using the bank details above. After transferring, enter your bank transaction reference number below.',
  },
  cashfree: {
    enabled: false,
    environment: 'sandbox',
    appIdEnvVar: 'CASHFREE_APP_ID',
    webhookUrl: '/api/subscription/cashfree-webhook',
  },
  updatedAt: Date.now(),
};

const DEFAULT_PREFERENCES = (email: string): UserPreferences => ({
  theme: 'dark',
  notifications: true,
  personalIntelligenceEnabled: true,
  customInstructions: '',
  importedMemory: '',
  taskDepth: 'standard',
  autoPollTasks: true,
  skills: {
    imageGen: true,
    videoGen: true,
    musicGen: true,
    coding: true,
    guidedLearning: true,
    canvas: true,
  },
  voice: {
    voiceName: 'Zephyr',
    speechRate: 1.0,
    autoSpeakReplies: false,
  },
  media: {
    defaultAspectRatio: '1:1',
    defaultVideoResolution: '720p',
    autoplayVideo: false,
  },
  contactEmail: email,
});

const DEFAULT_MODELS: AIModelConfig[] = [
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    type: 'chat',
    provider: 'Google Gemini',
    enabled: true,
    description: 'Free Tier (Default) · Fast, reliable multimodal chat, vision & coding',
    costPerOp: 0.0002,
    isDefault: true,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    type: 'chat',
    provider: 'Google Gemini',
    enabled: true,
    description: 'Free Tier · Multimodal chat, image understanding, PDFs, coding & tasks',
    costPerOp: 0.0005,
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    type: 'chat',
    provider: 'Google Gemini',
    enabled: true,
    description: 'Free Tier · Latest Gemini Flash alias',
    costPerOp: 0.0005,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    type: 'code',
    provider: 'Google Gemini',
    enabled: true,
    description: 'Paid Key · Deep reasoning, complex architecture & STEM',
    costPerOp: 0.002,
    requiresPaidKey: true,
  },
  {
    id: 'free-image-gen',
    name: 'Free Image AI (Flux / SD)',
    type: 'image',
    provider: 'Free Image AI',
    enabled: true,
    description: 'Free Tier (Default) · AI photo generation without a paid Gemini key',
    costPerOp: 0,
    isDefault: true,
    requiresPaidKey: false,
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Gemini Flash Image (Paid Optional)',
    type: 'image',
    provider: 'Google Gemini',
    enabled: false,
    description: 'Optional Paid Key · Requires billing-enabled Gemini API key',
    costPerOp: 0.02,
    requiresPaidKey: true,
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Nano Banana 2.1 4K (Paid Optional)',
    type: 'image',
    provider: 'Google Gemini',
    enabled: false,
    description: 'Optional Paid Key · High-resolution 1K–4K (requires billing-enabled key)',
    costPerOp: 0.04,
    requiresPaidKey: true,
  },
  {
    id: 'gemini-omni-1.2-flash',
    name: 'Gemini Omni Flash',
    type: 'video',
    provider: 'Google Gemini',
    enabled: true,
    description: 'Text-to-video & photo-to-video generation',
    costPerOp: 0.1,
    requiresPaidKey: true,
  },
  {
    id: 'lyria-3-clip-preview',
    name: 'Lyria 3 Clip',
    type: 'audio',
    provider: 'Google Gemini',
    enabled: true,
    description: 'AI music & audio track generation (30s clips + lyrics)',
    costPerOp: 0.05,
    requiresPaidKey: true,
  },
];

const INITIAL_USERS: UserAccount[] = [
  {
    id: 'user-admin',
    email: 'siba02062005@gmail.com',
    name: 'Siba',
    bio: 'MY AI Workspace Administrator',
    role: 'admin',
    avatar: '',
    tier: 'Enterprise',
    generationLimits: {
      imagesRemaining: 9999,
      videosRemaining: 9999,
      audioRemaining: 9999,
      chatsRemaining: 99999,
      totalImagesQuota: 10000,
      totalVideosQuota: 10000,
      totalAudioQuota: 10000,
    },
    preferences: DEFAULT_PREFERENCES('siba02062005@gmail.com'),
    createdAt: Date.now() - 30 * 24 * 3600 * 1000,
    status: 'active',
  },
  {
    id: 'user-member',
    email: 'creator@myai.app',
    name: 'Creator Account',
    bio: 'Standard Creator',
    role: 'user',
    avatar: '',
    tier: 'Pro',
    generationLimits: {
      imagesRemaining: 50,
      videosRemaining: 20,
      audioRemaining: 25,
      chatsRemaining: 500,
      totalImagesQuota: 50,
      totalVideosQuota: 20,
      totalAudioQuota: 25,
    },
    preferences: DEFAULT_PREFERENCES('creator@myai.app'),
    createdAt: Date.now() - 7 * 24 * 3600 * 1000,
    status: 'active',
  },
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadData();
    this.ensureDefaultProviders();
  }

  ensureDefaultProviders(): void {
    if (!Array.isArray(this.data.apiProviders)) {
      this.data.apiProviders = [];
    }
    let changed = false;
    if (!this.data.apiProviders.some((p) => p.id === 'hf-default' || p.providerType === 'huggingface')) {
      this.data.apiProviders.push({
        id: 'hf-default',
        name: 'Hugging Face',
        category: 'image',
        providerType: 'huggingface',
        apiUrl: 'https://router.huggingface.co',
        modelName: 'black-forest-labs/FLUX.1-schnell',
        apiKeyEnvVar: 'HF_TOKEN',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        timeoutMs: 45000,
        notes: 'Hugging Face router for text-to-image and image editing models.',
        enabled: false,
        lastTestStatus: 'untested',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      changed = true;
    }
    if (!this.data.apiProviders.some((p) => p.id === 'photoroom-default' || p.providerType === 'photoroom')) {
      this.data.apiProviders.push({
        id: 'photoroom-default',
        name: 'PhotoRoom',
        category: 'image_edit',
        providerType: 'photoroom',
        apiUrl: 'https://image-api.photoroom.com/v2/edit',
        modelName: 'photoroom-v2-edit',
        apiKeyEnvVar: 'PHOTOROOM_API_KEY',
        authHeader: 'x-api-key',
        authPrefix: '',
        timeoutMs: 35000,
        notes: 'PhotoRoom official API for background removal and prompt-based scene editing.',
        enabled: false,
        lastTestStatus: 'untested',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      changed = true;
    }
    if (changed) {
      this.saveData();
    }
  }

  private loadData(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch {
          // Ignore directory creation failure in read-only environments
        }
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return this.migrateSchema(parsed);
      } else if (isServerless && fs.existsSync(BUNDLED_DB_FILE)) {
        const raw = fs.readFileSync(BUNDLED_DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return this.migrateSchema(parsed);
      }
    } catch (e) {
      console.warn('Could not read existing database, initializing fresh store:', e);
    }

    const initial: DatabaseSchema = {
      schemaVersion: 2,
      users: INITIAL_USERS,
      chats: [],
      messages: {},
      jobs: [],
      models: DEFAULT_MODELS,
      notebooks: [
        {
          id: 'nb-getting-started',
          userId: 'user-admin',
          title: 'Project Brief & Research Notes',
          content:
            'Use Notebooks to store structured research, prompts, and reference notes. Attach any notebook to your MY AI chat from the (+) menu.',
          tags: ['research', 'notes'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      feedback: [],
      publicLinks: [],
      apiProviders: [],
      featureAssignments: { ...DEFAULT_FEATURE_ASSIGNMENTS },
      subscriptionPlans: [...DEFAULT_SUBSCRIPTION_PLANS],
      paymentSettings: { ...DEFAULT_PAYMENT_SETTINGS },
      paymentOrders: [],
      paymentTransactions: [],
      userSubscriptions: [],
      config: {
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
        supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        customImageEndpoint: '',
        customImageKey: '',
        customVideoEndpoint: '',
        customVideoKey: '',
        customAudioEndpoint: '',
        customAudioKey: '',
        geminiOverrideKey: '',
        enableAutoRouting: true,
        freeTierDailyImageLimit: 10,
        freeTierDailyVideoLimit: 3,
        freeTierDailyAudioLimit: 5,
        proTierDailyImageLimit: 100,
        proTierDailyVideoLimit: 25,
        proTierDailyAudioLimit: 40,
        safetyLevel: 'standard',
        siteName: 'MY AI',
        announcementBanner: '',
        maintenanceMode: false,
      },
      stats: {
        totalUsers: INITIAL_USERS.length,
        totalChats: 0,
        totalGenerations: 0,
        imagesGenerated: 0,
        videosGenerated: 0,
        audioGenerated: 0,
        tasksCompleted: 0,
        estimatedCostUsd: 0,
        uptimeHours: 1,
      },
    };

    this.saveData(initial);
    return initial;
  }

  private migrateSchema(parsed: any): DatabaseSchema {
    // Ensure new fields exist while preserving existing user chats/messages
    const users = (parsed.users || INITIAL_USERS).map((u: any) => ({
      ...u,
      avatar: u.avatar?.includes('unsplash.com') ? '' : (u.avatar || ''),
      generationLimits: {
        imagesRemaining: u.generationLimits?.imagesRemaining ?? 50,
        videosRemaining: u.generationLimits?.videosRemaining ?? 20,
        audioRemaining: u.generationLimits?.audioRemaining ?? 25,
        chatsRemaining: u.generationLimits?.chatsRemaining ?? 500,
        totalImagesQuota: u.generationLimits?.totalImagesQuota ?? 50,
        totalVideosQuota: u.generationLimits?.totalVideosQuota ?? 20,
        totalAudioQuota: u.generationLimits?.totalAudioQuota ?? 25,
      },
      preferences: {
        ...DEFAULT_PREFERENCES(u.email || 'user@myai.app'),
        ...(u.preferences || {}),
      },
    }));

    // Merge models to ensure defaults exist while preserving user/admin modifications and custom models
    const existingModels: AIModelConfig[] = parsed.models || [];
    const needsPaidImageDefaultMigration = (parsed.schemaVersion || 1) < 2;
    const mergedModels = DEFAULT_MODELS.map((def) => {
      const found = existingModels.find((m) => m.id === def.id);
      if (needsPaidImageDefaultMigration && def.type === 'image') {
        return { ...def };
      }
      return found ? { ...def, ...found } : def;
    });

    // Keep any non-default models that may have been configured by the admin
    const extraModels = existingModels.filter(
      (m) => !DEFAULT_MODELS.some((def) => def.id === m.id)
    );
    const finalModels = [...mergedModels, ...extraModels];

    // Clean out any legacy hardcoded Unsplash/BigBuckBunny sample jobs if present
    const cleanedJobs = (parsed.jobs || []).filter(
      (j: GenerationJob) =>
        !j.id?.startsWith('job-demo-') &&
        !j.outputUrl?.includes('commondatastorage.googleapis.com/gtv-videos-bucket/sample/')
    );

    return {
      schemaVersion: 2,
      users,
      chats: parsed.chats || [],
      messages: parsed.messages || {},
      jobs: cleanedJobs,
      models: finalModels,
      notebooks: parsed.notebooks || [],
      feedback: parsed.feedback || [],
      publicLinks: parsed.publicLinks || [],
      apiProviders: (() => {
        const list: ApiProviderRecord[] = Array.isArray(parsed.apiProviders) ? [...parsed.apiProviders] : [];
        if (!list.some((p) => p.id === 'hf-default' || p.providerType === 'huggingface')) {
          list.push({
            id: 'hf-default',
            name: 'Hugging Face',
            category: 'image',
            providerType: 'huggingface',
            apiUrl: 'https://router.huggingface.co',
            modelName: 'black-forest-labs/FLUX.1-schnell',
            apiKeyEnvVar: 'HF_TOKEN',
            authHeader: 'Authorization',
            authPrefix: 'Bearer ',
            timeoutMs: 45000,
            notes: 'Hugging Face router for text-to-image and image editing models.',
            enabled: false,
            lastTestStatus: 'untested',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        if (!list.some((p) => p.id === 'photoroom-default' || p.providerType === 'photoroom')) {
          list.push({
            id: 'photoroom-default',
            name: 'PhotoRoom',
            category: 'image_edit',
            providerType: 'photoroom',
            apiUrl: 'https://image-api.photoroom.com/v2/edit',
            modelName: 'photoroom-v2-edit',
            apiKeyEnvVar: 'PHOTOROOM_API_KEY',
            authHeader: 'x-api-key',
            authPrefix: '',
            timeoutMs: 35000,
            notes: 'PhotoRoom official API for background removal and prompt-based scene editing.',
            enabled: false,
            lastTestStatus: 'untested',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        return list;
      })(),
      featureAssignments: {
        ...DEFAULT_FEATURE_ASSIGNMENTS,
        ...(parsed.featureAssignments || {}),
      },
      subscriptionPlans:
        Array.isArray(parsed.subscriptionPlans) && parsed.subscriptionPlans.length > 0
          ? parsed.subscriptionPlans
          : [...DEFAULT_SUBSCRIPTION_PLANS],
      paymentSettings: parsed.paymentSettings
        ? {
            ...DEFAULT_PAYMENT_SETTINGS,
            ...parsed.paymentSettings,
            upiQr: { ...DEFAULT_PAYMENT_SETTINGS.upiQr, ...(parsed.paymentSettings.upiQr || {}) },
            upiId: { ...DEFAULT_PAYMENT_SETTINGS.upiId, ...(parsed.paymentSettings.upiId || {}) },
            bankTransfer: {
              ...DEFAULT_PAYMENT_SETTINGS.bankTransfer,
              ...(parsed.paymentSettings.bankTransfer || {}),
            },
            cashfree: {
              ...DEFAULT_PAYMENT_SETTINGS.cashfree,
              ...(parsed.paymentSettings.cashfree || {}),
            },
          }
        : { ...DEFAULT_PAYMENT_SETTINGS },
      paymentOrders: Array.isArray(parsed.paymentOrders) ? parsed.paymentOrders : [],
      paymentTransactions: Array.isArray(parsed.paymentTransactions) ? parsed.paymentTransactions : [],
      userSubscriptions: Array.isArray(parsed.userSubscriptions) ? parsed.userSubscriptions : [],
      config: {
        supabaseUrl: parsed.config?.supabaseUrl || process.env.SUPABASE_URL || '',
        supabaseAnonKey: parsed.config?.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '',
        supabaseServiceKey: parsed.config?.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        customImageEndpoint: parsed.config?.customImageEndpoint || '',
        customImageKey: parsed.config?.customImageKey || '',
        customVideoEndpoint: parsed.config?.customVideoEndpoint || '',
        customVideoKey: parsed.config?.customVideoKey || '',
        customAudioEndpoint: parsed.config?.customAudioEndpoint || '',
        customAudioKey: parsed.config?.customAudioKey || '',
        geminiOverrideKey: parsed.config?.geminiOverrideKey || '',
        enableAutoRouting: parsed.config?.enableAutoRouting ?? true,
        freeTierDailyImageLimit: parsed.config?.freeTierDailyImageLimit ?? 10,
        freeTierDailyVideoLimit: parsed.config?.freeTierDailyVideoLimit ?? 3,
        freeTierDailyAudioLimit: parsed.config?.freeTierDailyAudioLimit ?? 5,
        proTierDailyImageLimit: parsed.config?.proTierDailyImageLimit ?? 100,
        proTierDailyVideoLimit: parsed.config?.proTierDailyVideoLimit ?? 25,
        proTierDailyAudioLimit: parsed.config?.proTierDailyAudioLimit ?? 40,
        safetyLevel: parsed.config?.safetyLevel || 'standard',
        siteName: parsed.config?.siteName || 'MY AI',
        announcementBanner: parsed.config?.announcementBanner || '',
        maintenanceMode: parsed.config?.maintenanceMode ?? false,
      },
      stats: {
        totalUsers: users.length,
        totalChats: (parsed.chats || []).length,
        totalGenerations: parsed.stats?.totalGenerations ?? cleanedJobs.length,
        imagesGenerated: parsed.stats?.imagesGenerated ?? 0,
        videosGenerated: parsed.stats?.videosGenerated ?? 0,
        audioGenerated: parsed.stats?.audioGenerated ?? 0,
        tasksCompleted: parsed.stats?.tasksCompleted ?? 0,
        estimatedCostUsd: parsed.stats?.estimatedCostUsd ?? 0,
        uptimeHours: parsed.stats?.uptimeHours ?? 1,
      },
    };
  }

  private saveData(dataToSave?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        } catch {
          // In serverless, if directory cannot be created, keep in memory
          return;
        }
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave || this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Database persistence notice:', e);
    }
  }

  // Users
  getUsers(): UserAccount[] {
    return this.data.users.map((u) => {
      const activeSubscription = this.getUserActiveSubscription(u.id);
      return {
        ...u,
        activeSubscription: activeSubscription || undefined,
      };
    });
  }

  getUser(id: string): UserAccount | undefined {
    const user = this.data.users.find((u) => u.id === id);
    if (!user) return undefined;
    const activeSubscription = this.getUserActiveSubscription(user.id);
    return {
      ...user,
      activeSubscription: activeSubscription || undefined,
    };
  }

  getUserByEmail(email: string): UserAccount | undefined {
    const user = this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return undefined;
    const activeSubscription = this.getUserActiveSubscription(user.id);
    return {
      ...user,
      activeSubscription: activeSubscription || undefined,
    };
  }

  createUser(user: UserAccount): UserAccount {
    this.data.users.push(user);
    this.data.stats.totalUsers = this.data.users.length;
    this.saveData();
    return user;
  }

  updateUser(id: string, updates: Partial<UserAccount>): UserAccount | null {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      preferences: updates.preferences
        ? { ...this.data.users[idx].preferences!, ...updates.preferences }
        : this.data.users[idx].preferences,
    };
    this.saveData();
    return this.data.users[idx];
  }

  // Chats
  getChats(userId: string): ChatConversation[] {
    return this.data.chats
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getAllChats(): ChatConversation[] {
    return [...this.data.chats].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getChat(id: string): ChatConversation | undefined {
    return this.data.chats.find((c) => c.id === id);
  }

  createChat(chat: ChatConversation): ChatConversation {
    this.data.chats.unshift(chat);
    if (!this.data.messages[chat.id]) {
      this.data.messages[chat.id] = [];
    }
    this.data.stats.totalChats = this.data.chats.length;
    this.saveData();
    return chat;
  }

  updateChat(id: string, updates: Partial<ChatConversation>): ChatConversation | null {
    const idx = this.data.chats.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.data.chats[idx] = { ...this.data.chats[idx], ...updates, updatedAt: Date.now() };
    this.saveData();
    return this.data.chats[idx];
  }

  deleteChat(id: string): boolean {
    this.data.chats = this.data.chats.filter((c) => c.id !== id);
    delete this.data.messages[id];
    this.data.publicLinks = this.data.publicLinks.filter((l) => l.chatId !== id);
    this.data.stats.totalChats = this.data.chats.length;
    this.saveData();
    return true;
  }

  deleteAllChatsForUser(userId: string): void {
    const userChatIds = new Set(this.data.chats.filter((c) => c.userId === userId).map((c) => c.id));
    this.data.chats = this.data.chats.filter((c) => c.userId !== userId);
    userChatIds.forEach((cid) => delete this.data.messages[cid]);
    this.data.publicLinks = this.data.publicLinks.filter((l) => !userChatIds.has(l.chatId));
    this.data.stats.totalChats = this.data.chats.length;
    this.saveData();
  }

  // Messages
  getMessages(chatId: string): ChatMessage[] {
    return this.data.messages[chatId] || [];
  }

  addMessage(chatId: string, message: ChatMessage): ChatMessage {
    if (!this.data.messages[chatId]) {
      this.data.messages[chatId] = [];
    }
    this.data.messages[chatId].push(message);

    const chat = this.data.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.updatedAt = Date.now();
      chat.messageCount = this.data.messages[chatId].length;
      if (message.role === 'user' && (chat.title === 'New Chat' || !chat.title)) {
        const cleanTitle = message.content.replace(/\s+/g, ' ').trim();
        chat.title = cleanTitle.slice(0, 38) + (cleanTitle.length > 38 ? '...' : '');
      }
      if (message.content) {
        chat.lastMessageSnippet = message.content.slice(0, 80);
      }
    }
    this.saveData();
    return message;
  }

  updateMessage(chatId: string, messageId: string, updates: Partial<ChatMessage>): ChatMessage | null {
    const msgs = this.data.messages[chatId];
    if (!msgs) return null;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return null;
    msgs[idx] = { ...msgs[idx], ...updates };
    this.saveData();
    return msgs[idx];
  }

  recoverStuckMessages(activeJobIds: Set<string> = new Set()): number {
    let fixed = 0;
    const now = Date.now();
    for (const [chatId, msgs] of Object.entries(this.data.messages)) {
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const isPendingOrStreaming = m.status === 'pending' || m.status === 'streaming';
        const hasActiveJob = m.jobId ? activeJobIds.has(m.jobId) : false;
        // Never interrupt active or recently-started requests. Only recover messages older than 2 minutes without an active worker job.
        const isStale = !hasActiveJob && now - (m.timestamp || 0) > 120_000;
        if (isPendingOrStreaming && isStale) {
          msgs[i] = {
            ...m,
            status: 'error',
            error: m.error || 'This request timed out before completing. Please send your message again.',
            content: m.content || 'This request timed out before completing. Please send your message again.',
          };
          fixed += 1;
        }
      }
      this.data.messages[chatId] = msgs;
    }
    if (fixed > 0) this.saveData();
    return fixed;
  }

  // Jobs & Library Items
  getJobs(userId?: string): GenerationJob[] {
    const list = userId ? this.data.jobs.filter((j) => j.userId === userId) : this.data.jobs;
    return [...list].sort((a, b) => b.timestamp - a.timestamp);
  }

  getJob(jobId: string): GenerationJob | undefined {
    return this.data.jobs.find((j) => j.id === jobId);
  }

  addJob(job: GenerationJob): GenerationJob {
    this.data.jobs.unshift(job);
    if (this.data.jobs.length > 300) {
      this.data.jobs.pop();
    }
    this.data.stats.totalGenerations += 1;
    if (job.type === 'image') this.data.stats.imagesGenerated += 1;
    if (job.type === 'video') this.data.stats.videosGenerated += 1;
    if (job.type === 'audio') this.data.stats.audioGenerated += 1;
    if (job.type === 'task') this.data.stats.tasksCompleted += 1;
    this.data.stats.estimatedCostUsd = Number((this.data.stats.estimatedCostUsd + (job.costUsd || 0)).toFixed(4));
    this.saveData();
    return job;
  }

  updateJob(jobId: string, updates: Partial<GenerationJob>): GenerationJob | null {
    const idx = this.data.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return null;
    this.data.jobs[idx] = { ...this.data.jobs[idx], ...updates };
    if (updates.costUsd) {
      this.data.stats.estimatedCostUsd = Number((this.data.stats.estimatedCostUsd + updates.costUsd).toFixed(4));
    }
    this.saveData();
    return this.data.jobs[idx];
  }

  deleteJob(jobId: string, userId?: string): boolean {
    const before = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => {
      if (j.id !== jobId) return true;
      if (userId && j.userId !== userId) return true;
      return false;
    });
    this.saveData();
    return this.data.jobs.length < before;
  }

  deleteAllJobsForUser(userId: string): void {
    this.data.jobs = this.data.jobs.filter((j) => j.userId !== userId);
    this.saveData();
  }

  // Notebooks
  getNotebooks(userId: string): NotebookItem[] {
    return this.data.notebooks
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  addNotebook(nb: NotebookItem): NotebookItem {
    this.data.notebooks.unshift(nb);
    this.saveData();
    return nb;
  }

  updateNotebook(id: string, userId: string, updates: Partial<NotebookItem>): NotebookItem | null {
    const idx = this.data.notebooks.findIndex((n) => n.id === id && n.userId === userId);
    if (idx === -1) return null;
    this.data.notebooks[idx] = {
      ...this.data.notebooks[idx],
      ...updates,
      updatedAt: Date.now(),
    };
    this.saveData();
    return this.data.notebooks[idx];
  }

  deleteNotebook(id: string, userId: string): boolean {
    const before = this.data.notebooks.length;
    this.data.notebooks = this.data.notebooks.filter((n) => !(n.id === id && n.userId === userId));
    this.saveData();
    return this.data.notebooks.length < before;
  }

  // Feedback & Reports
  addFeedback(entry: FeedbackEntry): FeedbackEntry {
    this.data.feedback.unshift(entry);
    this.saveData();
    return entry;
  }

  getFeedback(): FeedbackEntry[] {
    return this.data.feedback;
  }

  // Public Links
  getPublicLinks(userId: string): PublicLinkItem[] {
    const userChats = new Set(this.data.chats.filter((c) => c.userId === userId).map((c) => c.id));
    return this.data.publicLinks.filter((l) => userChats.has(l.chatId));
  }

  createPublicLink(chatId: string, title: string): PublicLinkItem {
    const existing = this.data.publicLinks.find((l) => l.chatId === chatId);
    if (existing) return existing;
    const item: PublicLinkItem = {
      id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      chatId,
      title,
      createdAt: Date.now(),
    };
    this.data.publicLinks.unshift(item);
    this.saveData();
    return item;
  }

  deletePublicLink(id: string): boolean {
    this.data.publicLinks = this.data.publicLinks.filter((l) => l.id !== id);
    this.saveData();
    return true;
  }

  // Models & Config
  getModels(): AIModelConfig[] {
    return this.data.models;
  }

  updateModel(id: string, updates: Partial<AIModelConfig>): AIModelConfig | null {
    const idx = this.data.models.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.data.models[idx] = { ...this.data.models[idx], ...updates };
    this.saveData();
    return this.data.models[idx];
  }

  getConfig(): ServerProviderSecrets {
    return this.data.config;
  }

  getSanitizedConfig() {
    const c = this.data.config;
    return {
      supabaseUrl: c.supabaseUrl,
      supabaseAnonKey: c.supabaseAnonKey,
      hasSupabaseServiceKey: !!(c.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasGeminiKey: !!(c.geminiOverrideKey || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')),
      customImageEndpoint: c.customImageEndpoint,
      hasCustomImageKey: !!c.customImageKey,
      customVideoEndpoint: c.customVideoEndpoint,
      hasCustomVideoKey: !!c.customVideoKey,
      customAudioEndpoint: c.customAudioEndpoint,
      hasCustomAudioKey: !!c.customAudioKey,
      enableAutoRouting: c.enableAutoRouting,
      freeTierDailyImageLimit: c.freeTierDailyImageLimit,
      freeTierDailyVideoLimit: c.freeTierDailyVideoLimit,
      freeTierDailyAudioLimit: c.freeTierDailyAudioLimit,
      proTierDailyImageLimit: c.proTierDailyImageLimit,
      proTierDailyVideoLimit: c.proTierDailyVideoLimit,
      proTierDailyAudioLimit: c.proTierDailyAudioLimit,
      safetyLevel: c.safetyLevel,
      siteName: c.siteName,
      announcementBanner: c.announcementBanner,
      maintenanceMode: c.maintenanceMode,
    };
  }

  updateConfig(updates: Partial<ServerProviderSecrets>) {
    // Never overwrite valid secrets, URLs, or keys with empty or whitespace-only strings
    const next = { ...this.data.config };
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) {
        if (
          (key === 'supabaseUrl' ||
            key === 'supabaseAnonKey' ||
            key === 'supabaseServiceKey' ||
            key === 'customImageKey' ||
            key === 'customVideoKey' ||
            key === 'customAudioKey' ||
            key === 'geminiOverrideKey') &&
          (!val || (typeof val === 'string' && val.trim() === ''))
        ) {
          continue;
        }
        (next as any)[key] = typeof val === 'string' ? val.trim() : val;
      }
    }
    this.data.config = next;
    this.saveData();
    return this.getSanitizedConfig();
  }

  getStats(): SystemStats {
    this.data.stats.totalUsers = this.data.users.length;
    this.data.stats.totalChats = this.data.chats.length;
    return this.data.stats;
  }

  // AI Model API Management (metadata in store, keys strictly in server secrets/env)
  private sanitizeApiProvider(record: ApiProviderRecord): SanitizedApiProviderEntry {
    const secretStatus = getProviderSecretStatus(record.id, record.apiKeyEnvVar);
    return {
      ...record,
      hasApiKey: secretStatus.hasApiKey,
      keySource: secretStatus.keySource,
      maskedKey: secretStatus.maskedKey,
    };
  }

  getApiProviders(): ApiProviderRecord[] {
    if (!Array.isArray(this.data.apiProviders)) {
      this.data.apiProviders = [];
    }
    return this.data.apiProviders;
  }

  getSanitizedApiProviders(): SanitizedApiProviderEntry[] {
    return this.getApiProviders().map((p) => this.sanitizeApiProvider(p));
  }

  getApiProvider(id: string): ApiProviderRecord | undefined {
    return this.getApiProviders().find((p) => p.id === id);
  }

  createApiProvider(
    input: Omit<
      ApiProviderRecord,
      'id' | 'createdAt' | 'updatedAt' | 'lastTestStatus'
    > & { apiKey?: string }
  ): SanitizedApiProviderEntry {
    const now = Date.now();
    const id = `api-${input.category}-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const record: ApiProviderRecord = {
      id,
      name: (input.name || '').trim() || 'Custom AI Provider',
      category: input.category,
      providerType: input.providerType || 'openai_compatible',
      apiUrl: (input.apiUrl || '').trim(),
      modelName: (input.modelName || '').trim(),
      apiKeyEnvVar: (input.apiKeyEnvVar || '').trim() || undefined,
      authHeader: (input.authHeader || '').trim() || 'Authorization',
      authPrefix: input.authPrefix !== undefined ? input.authPrefix : 'Bearer ',
      timeoutMs: typeof input.timeoutMs === 'number' && input.timeoutMs >= 3000 ? input.timeoutMs : 35000,
      extraHeadersJson: (input.extraHeadersJson || '').trim() || undefined,
      extraBodyJson: (input.extraBodyJson || '').trim() || undefined,
      notes: (input.notes || '').trim() || undefined,
      enabled: input.enabled ?? true,
      lastTestStatus: 'untested',
      createdAt: now,
      updatedAt: now,
    };

    if (input.apiKey && input.apiKey.trim()) {
      setProviderSecret(id, input.apiKey.trim());
    }

    if (!Array.isArray(this.data.apiProviders)) {
      this.data.apiProviders = [];
    }
    this.data.apiProviders.unshift(record);
    this.saveData();
    return this.sanitizeApiProvider(record);
  }

  updateApiProvider(
    id: string,
    updates: Partial<Omit<ApiProviderRecord, 'id' | 'createdAt'>> & {
      apiKey?: string;
      clearApiKey?: boolean;
    }
  ): SanitizedApiProviderEntry | null {
    const list = this.getApiProviders();
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    const { apiKey, clearApiKey, ...rest } = updates;
    const current = list[idx];
    const next: ApiProviderRecord = {
      ...current,
      ...rest,
      apiUrl: rest.apiUrl !== undefined ? rest.apiUrl.trim() : current.apiUrl,
      modelName: rest.modelName !== undefined ? rest.modelName.trim() : current.modelName,
      name: rest.name !== undefined ? rest.name.trim() : current.name,
      apiKeyEnvVar:
        rest.apiKeyEnvVar !== undefined ? rest.apiKeyEnvVar.trim() || undefined : current.apiKeyEnvVar,
      updatedAt: Date.now(),
    };

    if (clearApiKey) {
      deleteProviderSecret(id);
    } else if (typeof apiKey === 'string' && apiKey.trim()) {
      setProviderSecret(id, apiKey.trim());
    }

    list[idx] = next;
    this.saveData();
    return this.sanitizeApiProvider(next);
  }

  deleteApiProvider(id: string): boolean {
    const list = this.getApiProviders();
    const before = list.length;
    this.data.apiProviders = list.filter((p) => p.id !== id);
    if (this.data.apiProviders.length === before) return false;

    deleteProviderSecret(id);

    const assignments = this.getFeatureAssignments();
    let assignmentChanged = false;
    for (const cat of Object.keys(assignments) as ApiCapabilityCategory[]) {
      if (assignments[cat] === id) {
        assignments[cat] = 'built-in';
        assignmentChanged = true;
      }
    }
    if (assignmentChanged) {
      this.data.featureAssignments = assignments;
    }

    this.saveData();
    return true;
  }

  getFeatureAssignments(): FeatureProviderAssignments {
    if (!this.data.featureAssignments) {
      this.data.featureAssignments = { ...DEFAULT_FEATURE_ASSIGNMENTS };
    }
    return {
      ...DEFAULT_FEATURE_ASSIGNMENTS,
      ...this.data.featureAssignments,
    };
  }

  updateFeatureAssignments(
    updates: Partial<FeatureProviderAssignments>
  ): FeatureProviderAssignments {
    const current = this.getFeatureAssignments();
    const next: FeatureProviderAssignments = { ...current };
    for (const cat of ['text', 'image', 'image_edit', 'video', 'audio', 'code'] as ApiCapabilityCategory[]) {
      const val = updates[cat];
      if (typeof val === 'string' && val.trim()) {
        if (val === 'built-in' || this.getApiProvider(val)) {
          next[cat] = val;
        }
      }
    }
    this.data.featureAssignments = next;
    this.saveData();
    return next;
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION PLANS
  // ---------------------------------------------------------------------------

  getSubscriptionPlans(includeDisabled = false): SubscriptionPlan[] {
    if (!Array.isArray(this.data.subscriptionPlans) || this.data.subscriptionPlans.length === 0) {
      this.data.subscriptionPlans = [...DEFAULT_SUBSCRIPTION_PLANS];
      this.saveData();
    }
    const plans = includeDisabled
      ? this.data.subscriptionPlans
      : this.data.subscriptionPlans.filter((p) => p.enabled);
    return [...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  getSubscriptionPlan(id: string): SubscriptionPlan | undefined {
    const plans = this.getSubscriptionPlans(true);
    return plans.find((p) => p.id === id);
  }

  createSubscriptionPlan(data: Partial<SubscriptionPlan>): SubscriptionPlan {
    const plans = this.getSubscriptionPlans(true);
    const now = Date.now();
    const id = data.id?.trim() || `plan_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const newPlan: SubscriptionPlan = {
      id,
      name: data.name?.trim() || 'New Plan',
      title: data.title?.trim() || '',
      description: data.description?.trim() || '',
      priceINR: typeof data.priceINR === 'number' ? Math.max(0, data.priceINR) : 0,
      billingCycle: data.billingCycle || 'monthly',
      durationDays:
        typeof data.durationDays === 'number'
          ? Math.max(0, data.durationDays)
          : data.billingCycle === 'yearly'
          ? 365
          : data.billingCycle === 'monthly'
          ? 30
          : 0,
      durationLabel:
        data.durationLabel?.trim() ||
        (data.billingCycle === 'yearly'
          ? 'Year'
          : data.billingCycle === 'monthly'
          ? 'Month'
          : data.billingCycle === 'free'
          ? 'Free Forever'
          : `${data.durationDays || 30} Days`),
      tier: data.tier || 'Pro',
      features: Array.isArray(data.features) && data.features.length > 0 ? data.features : ['Standard Access'],
      limits: {
        imagesQuota: data.limits?.imagesQuota ?? 100,
        videosQuota: data.limits?.videosQuota ?? 25,
        audioQuota: data.limits?.audioQuota ?? 40,
        chatsQuota: data.limits?.chatsQuota ?? 1000,
      },
      enabled: data.enabled ?? true,
      isPopular: !!data.isPopular,
      isRecommended: !!data.isRecommended,
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : plans.length + 1,
      createdAt: now,
      updatedAt: now,
    };

    if (!Array.isArray(this.data.subscriptionPlans)) {
      this.data.subscriptionPlans = [];
    }
    this.data.subscriptionPlans.push(newPlan);
    this.saveData();
    return newPlan;
  }

  updateSubscriptionPlan(id: string, updates: Partial<SubscriptionPlan>): SubscriptionPlan | null {
    const plans = this.getSubscriptionPlans(true);
    const idx = plans.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    const existing = plans[idx];
    const updated: SubscriptionPlan = {
      ...existing,
      ...updates,
      priceINR: updates.priceINR !== undefined ? Math.max(0, Number(updates.priceINR)) : existing.priceINR,
      durationDays:
        updates.durationDays !== undefined ? Math.max(0, Number(updates.durationDays)) : existing.durationDays,
      limits: updates.limits
        ? {
            imagesQuota: updates.limits.imagesQuota ?? existing.limits.imagesQuota,
            videosQuota: updates.limits.videosQuota ?? existing.limits.videosQuota,
            audioQuota: updates.limits.audioQuota ?? existing.limits.audioQuota,
            chatsQuota: updates.limits.chatsQuota ?? existing.limits.chatsQuota,
          }
        : existing.limits,
      features: Array.isArray(updates.features) ? updates.features : existing.features,
      updatedAt: Date.now(),
    };

    plans[idx] = updated;
    this.data.subscriptionPlans = plans;
    this.saveData();
    return updated;
  }

  deleteSubscriptionPlan(id: string): boolean {
    const plans = this.getSubscriptionPlans(true);
    const before = plans.length;
    this.data.subscriptionPlans = plans.filter((p) => p.id !== id);
    if (this.data.subscriptionPlans.length !== before) {
      this.saveData();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // PAYMENT SETTINGS
  // ---------------------------------------------------------------------------

  getPaymentSettings(): PaymentSettings {
    if (!this.data.paymentSettings) {
      this.data.paymentSettings = { ...DEFAULT_PAYMENT_SETTINGS };
      this.saveData();
    }
    return {
      ...DEFAULT_PAYMENT_SETTINGS,
      ...this.data.paymentSettings,
      upiQr: { ...DEFAULT_PAYMENT_SETTINGS.upiQr, ...(this.data.paymentSettings.upiQr || {}) },
      upiId: { ...DEFAULT_PAYMENT_SETTINGS.upiId, ...(this.data.paymentSettings.upiId || {}) },
      bankTransfer: {
        ...DEFAULT_PAYMENT_SETTINGS.bankTransfer,
        ...(this.data.paymentSettings.bankTransfer || {}),
      },
      cashfree: {
        ...DEFAULT_PAYMENT_SETTINGS.cashfree,
        ...(this.data.paymentSettings.cashfree || {}),
      },
    };
  }

  getSanitizedPaymentSettings(): PaymentSettings {
    const raw = this.getPaymentSettings();
    const { key: cfSecret } = resolveProviderSecret('cashfree', 'CASHFREE_SECRET_KEY');
    const hasSecretKey = !!cfSecret;
    const maskedSecret = cfSecret
      ? cfSecret.length > 8
        ? `••••${cfSecret.slice(-4)}`
        : '••••••'
      : undefined;

    return {
      ...raw,
      cashfree: {
        ...raw.cashfree,
        hasSecretKey,
        maskedSecret,
      },
    };
  }

  updatePaymentSettings(updates: Partial<PaymentSettings>): PaymentSettings {
    const current = this.getPaymentSettings();
    const next: PaymentSettings = {
      ...current,
      upiQr: updates.upiQr ? { ...current.upiQr, ...updates.upiQr } : current.upiQr,
      upiId: updates.upiId ? { ...current.upiId, ...updates.upiId } : current.upiId,
      bankTransfer: updates.bankTransfer ? { ...current.bankTransfer, ...updates.bankTransfer } : current.bankTransfer,
      cashfree: updates.cashfree ? { ...current.cashfree, ...updates.cashfree } : current.cashfree,
      updatedAt: Date.now(),
    };

    this.data.paymentSettings = next;
    this.saveData();
    return this.getSanitizedPaymentSettings();
  }

  // ---------------------------------------------------------------------------
  // PAYMENT ORDERS
  // ---------------------------------------------------------------------------

  getPaymentOrders(filter?: { userId?: string; status?: string }): PaymentOrder[] {
    if (!Array.isArray(this.data.paymentOrders)) {
      this.data.paymentOrders = [];
    }
    let list = this.data.paymentOrders;
    if (filter?.userId) {
      list = list.filter((o) => o.userId === filter.userId);
    }
    if (filter?.status) {
      list = list.filter((o) => o.status === filter.status);
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }

  getPaymentOrder(id: string): PaymentOrder | undefined {
    return (this.data.paymentOrders || []).find((o) => o.id === id);
  }

  getPaymentOrderByRef(ref: string): PaymentOrder | undefined {
    return (this.data.paymentOrders || []).find(
      (o) => o.referenceNumber?.toLowerCase() === ref?.trim().toLowerCase()
    );
  }

  createPaymentOrder(data: Partial<PaymentOrder>): PaymentOrder {
    if (!Array.isArray(this.data.paymentOrders)) {
      this.data.paymentOrders = [];
    }
    const now = Date.now();
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceNumber = `MYAI-ORD-${now.toString().slice(-6)}-${randSuffix}`;
    const id = data.id || `ord_${now}_${Math.random().toString(36).substring(2, 7)}`;

    const order: PaymentOrder = {
      id,
      userId: data.userId || 'user-admin',
      userEmail: data.userEmail || 'user@myai.app',
      userName: data.userName || 'MY AI User',
      planId: data.planId || 'plan_pro_monthly',
      planName: data.planName || 'Pro Plan',
      amountINR: data.amountINR ?? 0,
      paymentMethod: data.paymentMethod || 'upi_qr',
      status: data.status || 'pending_verification',
      referenceNumber,
      userTransactionRef: data.userTransactionRef?.trim() || '',
      userProofNotes: data.userProofNotes?.trim() || '',
      userProofScreenshotUrl: data.userProofScreenshotUrl || '',
      cashfreeOrderId: data.cashfreeOrderId || '',
      cashfreePaymentSessionId: data.cashfreePaymentSessionId || '',
      createdAt: now,
      updatedAt: now,
    };

    this.data.paymentOrders.push(order);
    this.saveData();
    return order;
  }

  updatePaymentOrder(id: string, updates: Partial<PaymentOrder>): PaymentOrder | null {
    if (!Array.isArray(this.data.paymentOrders)) return null;
    const idx = this.data.paymentOrders.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const existing = this.data.paymentOrders[idx];
    const updated: PaymentOrder = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.data.paymentOrders[idx] = updated;
    this.saveData();
    return updated;
  }

  approvePaymentOrder(
    orderId: string,
    verifiedBy: string
  ): { success: boolean; order?: PaymentOrder; subscription?: UserSubscription; error?: string } {
    const order = this.getPaymentOrder(orderId);
    if (!order) {
      return { success: false, error: 'Payment order not found.' };
    }
    if (order.status === 'approved') {
      return { success: false, error: 'Order is already approved.' };
    }

    const plan = this.getSubscriptionPlan(order.planId);
    if (!plan) {
      return { success: false, error: 'Referenced subscription plan was not found.' };
    }

    // Activate subscription for the user
    const subscription = this.activateUserSubscription(order.userId, plan, order.id);

    // Update order status
    const updatedOrder = this.updatePaymentOrder(orderId, {
      status: 'approved',
      verifiedAt: Date.now(),
      verifiedBy,
    });

    // Record transaction
    this.addPaymentTransaction({
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderId: order.id,
      userId: order.userId,
      userEmail: order.userEmail,
      planId: order.planId,
      amountINR: order.amountINR,
      paymentMethod: order.paymentMethod,
      gatewayStatus: 'SUCCESS',
      createdAt: Date.now(),
    });

    return {
      success: true,
      order: updatedOrder || order,
      subscription,
    };
  }

  rejectPaymentOrder(
    orderId: string,
    reason: string,
    verifiedBy: string
  ): { success: boolean; order?: PaymentOrder; error?: string } {
    const order = this.getPaymentOrder(orderId);
    if (!order) {
      return { success: false, error: 'Payment order not found.' };
    }
    if (order.status === 'approved') {
      return { success: false, error: 'Cannot reject an already approved payment.' };
    }

    const updatedOrder = this.updatePaymentOrder(orderId, {
      status: 'rejected',
      rejectionReason: reason?.trim() || 'Payment could not be verified in official bank/UPI records.',
      verifiedAt: Date.now(),
      verifiedBy,
    });

    return {
      success: true,
      order: updatedOrder || order,
    };
  }

  // ---------------------------------------------------------------------------
  // TRANSACTIONS
  // ---------------------------------------------------------------------------

  getPaymentTransactions(): PaymentTransaction[] {
    if (!Array.isArray(this.data.paymentTransactions)) {
      this.data.paymentTransactions = [];
    }
    return [...this.data.paymentTransactions].sort((a, b) => b.createdAt - a.createdAt);
  }

  addPaymentTransaction(tx: PaymentTransaction): PaymentTransaction {
    if (!Array.isArray(this.data.paymentTransactions)) {
      this.data.paymentTransactions = [];
    }
    this.data.paymentTransactions.push(tx);
    this.saveData();
    return tx;
  }

  // ---------------------------------------------------------------------------
  // USER SUBSCRIPTIONS & ACTIVATION
  // ---------------------------------------------------------------------------

  getUserSubscriptions(userId: string): UserSubscription[] {
    if (!Array.isArray(this.data.userSubscriptions)) {
      this.data.userSubscriptions = [];
    }
    return this.data.userSubscriptions
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getUserActiveSubscription(userId: string): UserSubscription | null {
    if (!Array.isArray(this.data.userSubscriptions)) {
      this.data.userSubscriptions = [];
      return null;
    }

    const now = Date.now();
    const subs = this.data.userSubscriptions.filter((s) => s.userId === userId && s.status === 'active');
    if (subs.length === 0) return null;

    // Check expiry
    for (const sub of subs) {
      if (sub.expiryDate > 0 && now > sub.expiryDate) {
        sub.status = 'expired';
        sub.updatedAt = now;
        this.saveData();
      }
    }

    const stillActive = subs.find((s) => s.status === 'active');
    return stillActive || null;
  }

  activateUserSubscription(
    userId: string,
    plan: SubscriptionPlan,
    orderId?: string
  ): UserSubscription {
    if (!Array.isArray(this.data.userSubscriptions)) {
      this.data.userSubscriptions = [];
    }

    const now = Date.now();
    const user = this.data.users.find((u) => u.id === userId);
    const userEmail = user?.email || 'user@myai.app';

    // Mark any existing active subscriptions as superseded
    this.data.userSubscriptions.forEach((s) => {
      if (s.userId === userId && s.status === 'active') {
        s.status = 'cancelled';
        s.updatedAt = now;
      }
    });

    // Calculate expiry: durationDays === 0 means free/lifetime (0 timestamp)
    const expiryDate =
      plan.durationDays > 0 ? now + plan.durationDays * 24 * 3600 * 1000 : 0;

    const newSub: UserSubscription = {
      id: `sub_${now}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      userEmail,
      planId: plan.id,
      planName: plan.name,
      tier: plan.tier || 'Pro',
      amountPaidINR: plan.priceINR,
      orderId,
      startDate: now,
      expiryDate,
      status: 'active',
      limitsGranted: {
        images: plan.limits?.imagesQuota ?? 100,
        videos: plan.limits?.videosQuota ?? 25,
        audio: plan.limits?.audioQuota ?? 40,
        chats: plan.limits?.chatsQuota ?? 1000,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.data.userSubscriptions.push(newSub);

    // Apply generation quotas and tier directly to user account
    if (user) {
      user.tier = (plan.tier as any) || 'Pro';
      user.generationLimits = {
        imagesRemaining: plan.limits?.imagesQuota ?? 100,
        videosRemaining: plan.limits?.videosQuota ?? 25,
        audioRemaining: plan.limits?.audioQuota ?? 40,
        chatsRemaining: plan.limits?.chatsQuota ?? 1000,
        totalImagesQuota: plan.limits?.imagesQuota ?? 100,
        totalVideosQuota: plan.limits?.videosQuota ?? 25,
        totalAudioQuota: plan.limits?.audioQuota ?? 40,
      };
      user.activeSubscription = newSub;
    }

    this.saveData();
    return newSub;
  }

  manualGrantSubscription(
    userId: string,
    planId: string,
    customDurationDays?: number,
    verifiedBy?: string
  ): { success: boolean; user?: UserAccount; subscription?: UserSubscription; error?: string } {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found.' };

    const plan = this.getSubscriptionPlan(planId);
    if (!plan) return { success: false, error: 'Plan not found.' };

    const effectivePlan: SubscriptionPlan = {
      ...plan,
      durationDays:
        typeof customDurationDays === 'number' && customDurationDays > 0
          ? customDurationDays
          : plan.durationDays,
    };

    const sub = this.activateUserSubscription(userId, effectivePlan, `manual-grant-by-${verifiedBy || 'admin'}`);
    return {
      success: true,
      user: this.getUser(userId),
      subscription: sub,
    };
  }
}

export const db = new Database();

