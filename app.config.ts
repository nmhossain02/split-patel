import { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';

type Environment = Readonly<Record<string, string | undefined>>;
type FileExists = (path: string) => boolean;

const localAndroidServicesFile = './google-services.json';
const localIosServicesFile = './GoogleService-Info.plist';

export function resolveNativeServicesFile(
  configuredPath: string | undefined,
  localPath: string,
  fileExists: FileExists = existsSync,
): string | undefined {
  const trimmedPath = configuredPath?.trim();
  if (trimmedPath) return trimmedPath;
  return fileExists(localPath) ? localPath : undefined;
}

export function resolveExpoConfig(
  config: Partial<ExpoConfig>,
  environment: Environment = process.env,
  fileExists: FileExists = existsSync,
): ExpoConfig {
  if (environment.EAS_BUILD_PROFILE === 'production') {
    const required = [
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'GOOGLE_SERVICES_JSON',
      'GOOGLE_SERVICES_INFO_PLIST',
    ].filter(name => !environment[name]?.trim());
    if (required.length > 0) {
      throw new Error(`Production native build is missing required variables: ${required.join(', ')}`);
    }
  }

  const androidServicesFile = resolveNativeServicesFile(
    environment.GOOGLE_SERVICES_JSON,
    localAndroidServicesFile,
    fileExists,
  );
  const iosServicesFile = resolveNativeServicesFile(
    environment.GOOGLE_SERVICES_INFO_PLIST,
    localIosServicesFile,
    fileExists,
  );

  return {
    ...config,
    name: config.name ?? 'split-patel',
    slug: config.slug ?? 'split-patel',
    ios: {
      ...config.ios,
      ...(iosServicesFile ? { googleServicesFile: iosServicesFile } : {}),
    },
    android: {
      ...config.android,
      ...(androidServicesFile ? { googleServicesFile: androidServicesFile } : {}),
    },
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  return resolveExpoConfig(config);
};
