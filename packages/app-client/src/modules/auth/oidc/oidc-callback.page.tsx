import { useNavigate, useSearchParams } from '@solidjs/router';
import { type Component, createEffect, createSignal, Show } from 'solid-js';
import { safely } from '@corentinth/chisels';
import { handleOidcCallback } from './oidc.services';
import { authStore } from '../auth.store';
import { Alert, AlertDescription } from '@/modules/ui/components/alert';
import { useI18n } from '@/modules/i18n/i18n.provider';

export const OidcCallbackPage: Component = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [getError, setError] = createSignal<string | null>(null);
  const [isProcessing, setIsProcessing] = createSignal(true);

  createEffect(async () => {
    const code = searchParams.code;
    const state = searchParams.state;
    const error = searchParams.error;
    const errorDescription = searchParams.error_description;

    const [result, callbackError] = await safely(
      handleOidcCallback({
        code,
        state,
        error,
        error_description: errorDescription,
      }),
    );

    if (callbackError) {
      setError(callbackError.message || 'Authentication failed');
      setIsProcessing(false);
      return;
    }

    if (result) {
      const { accessToken } = result;
      authStore.setAccessToken({ accessToken });

      // Redirect to the originally requested page or home
      const redirectUrl = authStore.getRedirectUrl() ?? '/';
      window.location.href = redirectUrl;
    }
  });

  return (
    <div class="flex h-screen w-full items-center justify-center">
      <div class="px-6 md:max-w-md mx-auto text-center">
        <Show when={isProcessing()} fallback={null}>
          <div class="flex flex-col items-center gap-4">
            <div class="i-tabler-loader-2 text-4xl animate-spin text-primary" />
            <h1 class="text-lg font-semibold">
              {t('login.oidc.processing', { defaultValue: 'Completing authentication...' })}
            </h1>
            <p class="text-muted-foreground">
              {t('login.oidc.please-wait', { defaultValue: 'Please wait while we complete your login.' })}
            </p>
          </div>
        </Show>

        <Show when={getError()}>
          {error => (
            <div class="flex flex-col gap-4">
              <Alert variant="destructive">
                <AlertDescription>
                  {error()}
                </AlertDescription>
              </Alert>
              <button
                class="text-primary hover:underline"
                onClick={() => navigate('/login')}
              >
                {t('login.oidc.back-to-login', { defaultValue: 'Back to login' })}
              </button>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};
