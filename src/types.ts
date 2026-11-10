export type Role = 'user' | 'assistant' | 'system';

export type MediaType = 'text' | 'image' | 'video' | 'audio' | 'code' | 'document' | 'canvas' | 'task';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ComposerTab = 'chat' | 'task';

export type ChatSkillMode =
  | 'standard'
  | 'create_images'
  | 'create_videos'
  | 'create_music'
  | 'canvas'
  | 'guided_learning'
  | 'personal_intelligence';

export type DetectedIntent =
  | 'text'
  | 'image_generation'
  | 'video_generation'
  | 'photo_to_video'
  | 'image_editing'
  | 'image_understanding'
  | 'audio_generation'
  | 'coding'
  | 'document_analysis'
  | 'canvas'
  | 'guided_learning'
  | 'task'
  | 'translation_writing';

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size?: number;
  type: 'image' | 'video' | 'document' | 'audio' | 'code' | 'notebook' | 'drive';
  textPreview?: string;
}

export interface MediaPayload {
  type: 'image' | 'video' | 'audio' | 'code' | 'document';
  url?: string;
  thumbnail?: string;
  alt?: string;
  prompt?: string;
  lyrics?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: string;
  codeLanguage?: string;
  fileInfo?: { name: string; size: number; mimeType: string };
}

export interface TaskStep {
  id: string;
  title: string;
  detail?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface CanvasPayload {
  title: string;
  kind: 'code' | 'document' | 'slides';
  language?: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  timestamp: number;
  status?: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled';
  mediaType?: MediaType;
  mediaData?: MediaPayload;
  attachments?: Attachment[];
  taskSteps?: TaskStep[];
  canvasData?: CanvasPayload;
  jobId?: string;
  modelUsed?: string;
  intentDetected?: DetectedIntent;
  processingTimeMs?: number;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  googleStatus?: string;
  reason?: string;
  rawError?: string;
  missingConfig?: string;
  saved?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  messageCount?: number;
  lastMessageSnippet?: string;
  skillMode?: ChatSkillMode;
}

export interface UserPreferences {
  theme: ThemePreference;
  notifications: boolean;
  personalIntelligenceEnabled: boolean;
  customInstructions: string;
  importedMemory: string;
  taskDepth: 'concise' | 'standard' | 'deep';
  autoPollTasks: boolean;
  skills: {
    imageGen: boolean;
    videoGen: boolean;
    musicGen: boolean;
    coding: boolean;
    guidedLearning: boolean;
    canvas: boolean;
  };
  voice: {
    voiceName: string;
    speechRate: number;
    autoSpeakReplies: boolean;
  };
  media: {
    defaultAspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    defaultVideoResolution: '720p' | '1080p' | '4k';
    autoplayVideo: boolean;
  };
  contactEmail: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  bio?: string;
  role: 'admin' | 'user';
  avatar: string;
  tier: 'Free' | 'Pro' | 'Enterprise' | string;
  generationLimits: {
    imagesRemaining: number;
    videosRemaining: number;
    audioRemaining: number;
    chatsRemaining: number;
    totalImagesQuota: number;
    totalVideosQuota: number;
    totalAudioQuota: number;
  };
  preferences?: UserPreferences;
  activeSubscription?: UserSubscription;
  createdAt: number;
  status: 'active' | 'suspended';
}

export interface AIModelConfig {
  id: string;
  name: string;
  type: 'chat' | 'code' | 'image' | 'video' | 'audio' | 'multimodal';
  provider:
    | 'Google Gemini'
    | 'Free Image AI'
    | 'Custom OpenAI-Compatible'
    | 'Custom Video API'
    | 'Custom Audio API'
    | string;
  enabled: boolean;
  description: string;
  costPerOp: number;
  isDefault?: boolean;
  requiresPaidKey?: boolean;
}

export type ApiCapabilityCategory = 'text' | 'image' | 'image_edit' | 'video' | 'audio' | 'code';

export type ApiProviderProtocol =
  | 'openai_compatible'
  | 'google_gemini'
  | 'anthropic'
  | 'huggingface'
  | 'photoroom'
  | 'custom_rest';

export interface SanitizedApiProviderEntry {
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
  hasApiKey: boolean;
  keySource: 'env' | 'server_secret' | 'none';
  maskedKey?: string;
  lastTestStatus: 'untested' | 'connected' | 'failed';
  lastTestedAt?: number;
  lastTestLatencyMs?: number;
  lastTestMessage?: string;
  lastErrorLog?: string;
  createdAt: number;
  updatedAt: number;
}

export type FeatureProviderAssignments = Record<ApiCapabilityCategory, string>;

export interface ApiConnectionTestResult {
  connected: boolean;
  configured: boolean;
  providerId?: string;
  category: ApiCapabilityCategory;
  modelName: string;
  latencyMs: number;
  httpStatus?: number;
  message: string;
}

export interface GenerationJob {
  id: string;
  userId: string;
  userEmail: string;
  chatId?: string;
  messageId?: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'task';
  prompt: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  statusDetail?: string;
  model: string;
  interactionId?: string;
  timestamp: number;
  durationSeconds: number;
  costUsd?: number;
  outputUrl?: string;
  thumbnailUrl?: string;
  lyrics?: string;
  fileName?: string;
  mimeType?: string;
  saved?: boolean;
  error?: string;
}

export interface NotebookItem {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface FeedbackEntry {
  id: string;
  userId: string;
  userEmail: string;
  category: 'feedback' | 'bug';
  subject: string;
  message: string;
  createdAt: number;
}

export interface PublicLinkItem {
  id: string;
  chatId: string;
  title: string;
  createdAt: number;
}

export interface SystemStats {
  totalUsers: number;
  totalChats: number;
  totalGenerations: number;
  imagesGenerated: number;
  videosGenerated: number;
  audioGenerated: number;
  tasksCompleted: number;
  estimatedCostUsd: number;
  uptimeHours: number;
}

export interface ProviderConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  hasSupabaseServiceKey?: boolean;
  hasGeminiKey?: boolean;
  customImageEndpoint: string;
  hasCustomImageKey?: boolean;
  customVideoEndpoint: string;
  hasCustomVideoKey?: boolean;
  customAudioEndpoint: string;
  hasCustomAudioKey?: boolean;
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

// -----------------------------------------------------------------------------
// SUBSCRIPTION & PAYMENT MANAGEMENT TYPES
// -----------------------------------------------------------------------------

export type PlanBillingCycle = 'monthly' | 'yearly' | 'custom' | 'lifetime' | 'free';

export interface PlanLimits {
  imagesQuota: number;
  videosQuota: number;
  audioQuota: number;
  chatsQuota: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  title: string;
  description: string;
  priceINR: number;
  billingCycle: PlanBillingCycle;
  durationDays: number; // 0 = free/lifetime, 30 = monthly, 365 = yearly, or custom days
  durationLabel: string; // e.g. "Monthly", "Yearly", "14 Days", "Lifetime"
  tier: 'Free' | 'Pro' | 'Enterprise' | string;
  features: string[];
  limits: PlanLimits;
  enabled: boolean;
  isPopular?: boolean;
  isRecommended?: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type PaymentMethodType = 'upi_qr' | 'upi_id' | 'bank_transfer' | 'cashfree';

export interface PaymentSettings {
  upiQr: {
    enabled: boolean;
    qrImageUrl: string;
    upiId: string;
    accountHolderName: string;
    instructions?: string;
  };
  upiId: {
    enabled: boolean;
    upiId: string;
    accountHolderName: string;
    instructions?: string;
  };
  bankTransfer: {
    enabled: boolean;
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branchName?: string;
    instructions?: string;
  };
  cashfree: {
    enabled: boolean;
    environment: 'sandbox' | 'production';
    appIdEnvVar?: string;
    hasSecretKey?: boolean;
    maskedSecret?: string;
    webhookUrl?: string;
  };
  updatedAt: number;
}

export type PaymentOrderStatus = 'pending_verification' | 'approved' | 'rejected' | 'failed';

export interface PaymentOrder {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  planName: string;
  amountINR: number;
  paymentMethod: PaymentMethodType;
  status: PaymentOrderStatus;
  referenceNumber: string;
  userTransactionRef?: string;
  userProofNotes?: string;
  userProofScreenshotUrl?: string;
  cashfreeOrderId?: string;
  cashfreePaymentSessionId?: string;
  rejectionReason?: string;
  verifiedAt?: number;
  verifiedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentTransaction {
  id: string;
  orderId: string;
  userId: string;
  userEmail: string;
  planId: string;
  amountINR: number;
  paymentMethod: string;
  gatewayStatus?: string;
  gatewayTransactionId?: string;
  rawGatewayResponse?: any;
  createdAt: number;
}

export interface UserSubscription {
  id: string;
  userId: string;
  userEmail: string;
  planId: string;
  planName: string;
  tier: string;
  amountPaidINR: number;
  orderId?: string;
  startDate: number;
  expiryDate: number; // 0 for lifetime/free, timestamp for fixed period
  status: 'active' | 'expired' | 'cancelled';
  limitsGranted: {
    images: number;
    videos: number;
    audio: number;
    chats: number;
  };
  createdAt: number;
  updatedAt: number;
}
