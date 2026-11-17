// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		APP_CONFIG?: {
			firebaseApiKey?: string;
			firebaseAuthDomain?: string;
			firebaseProjectId?: string;
		};
	}
}

export {};
