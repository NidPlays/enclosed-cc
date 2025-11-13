import { type Component, createEffect, createSignal, Show } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { getOidcConfig, initiateOidcLogin } from './oidc.services';
import { useI18n } from '@/modules/i18n/i18n.provider';

export const OidcLoginButton: Component = () => {
  const { t } = useI18n();
  const [isEnabled, setIsEnabled] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);

  createEffect(async () => {
    try {
      const config = await getOidcConfig();
      setIsEnabled(config.enabled);
    } catch (error) {
      console.error('Failed to fetch OIDC config:', error);
      setIsEnabled(false);
    }
  });

  const handleOidcLogin = async () => {
    setIsLoading(true);
    try {
      await initiateOidcLogin();
    } catch (error) {
      console.error('OIDC login failed:', error);
      setIsLoading(false);
    }
  };

  return (
    <Show when={isEnabled()}>
      <div class="mt-4">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t" />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-background px-2 text-muted-foreground">
              {t('login.oidc.or', { defaultValue: 'Or continue with' })}
            </span>
          </div>
        </div>

        <Button
          class="mt-4 w-full"
          variant="outline"
          type="button"
          onClick={handleOidcLogin}
          disabled={isLoading()}
        >
          <Show when={isLoading()} fallback={
            <>
              <div class="i-tabler-login mr-2" />
              {t('login.oidc.button', { defaultValue: 'Sign in with SSO' })}
            </>
          }>
            <div class="i-tabler-loader-2 mr-2 animate-spin" />
            {t('login.oidc.redirecting', { defaultValue: 'Redirecting...' })}
          </Show>
        </Button>
      </div>
    </Show>
  );
};
