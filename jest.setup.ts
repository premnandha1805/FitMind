global.__DEV__ = false;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (values: Record<string, unknown>) => values.ios ?? values.default },
  Image: { getSize: jest.fn((_uri, ok) => ok(100, 100)) },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => 0),
      setValue: jest.fn(),
    })),
    timing: jest.fn(() => ({ start: jest.fn() })),
    loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    sequence: jest.fn(),
    spring: jest.fn(() => ({ start: jest.fn() })),
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    appOwnership: 'standalone',
    expoConfig: { extra: { geminiApiKey: '' } },
  },
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { MD5: 'MD5' },
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `md5-${value}`),
  randomUUID: jest.fn(() => 'test-uuid'),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1000 })),
  deleteAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: jest.fn(async (_uri: string, _actions: unknown[], _options: unknown) => ({
    uri: 'file:///tmp/manipulated.jpg',
    base64: 'abcd',
  })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 1 })),
    runSync: jest.fn(() => undefined),
    withTransactionSync: jest.fn((fn: () => void) => fn()),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    getFirstSync: jest.fn(() => null),
    getAllSync: jest.fn(() => []),
  })),
}));
