import { resolveExpoConfig, resolveNativeServicesFile } from '../../../app.config';

const baseConfig = {
  name: 'split-patel',
  slug: 'split-patel',
};

describe('native Expo configuration', () => {
  it('omits an absent local service file from non-production configuration', () => {
    expect(resolveNativeServicesFile(undefined, './google-services.json', () => false)).toBeUndefined();
  });

  it('uses an existing local service file for development', () => {
    expect(resolveNativeServicesFile(undefined, './google-services.json', () => true))
      .toBe('./google-services.json');
  });

  it('requires provider identifiers and service-file variables for production builds', () => {
    expect(() => resolveExpoConfig(baseConfig, { EAS_BUILD_PROFILE: 'production' }, () => false))
      .toThrow('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, GOOGLE_SERVICES_JSON, GOOGLE_SERVICES_INFO_PLIST');
  });

  it('applies explicit production service-file paths', () => {
    const config = resolveExpoConfig(baseConfig, {
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'client.apps.example',
      GOOGLE_SERVICES_JSON: '/build/google-services.json',
      GOOGLE_SERVICES_INFO_PLIST: '/build/GoogleService-Info.plist',
    }, () => false);

    expect(config.android?.googleServicesFile).toBe('/build/google-services.json');
    expect(config.ios?.googleServicesFile).toBe('/build/GoogleService-Info.plist');
  });
});
