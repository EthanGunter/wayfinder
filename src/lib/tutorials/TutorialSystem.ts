import type { ITutorialPersistence } from ".";

// Singleton tutorial manager that handles persistence and overlay communication
export default class TutorialSystem {
    private static instance: TutorialSystem | null = null;
    private persistence: ITutorialPersistence | null = null;
    private overlayElement: HTMLElement | null = null;

    static getInstance(): TutorialSystem {
        if (!TutorialSystem.instance) {
            TutorialSystem.instance = new TutorialSystem();
        }
        return TutorialSystem.instance;
    }

    initialize(persistence: ITutorialPersistence, overlayElement: HTMLElement): void {
        this.persistence = persistence;
        this.overlayElement = overlayElement;
    }

    getPersistence(): ITutorialPersistence {
        if (!this.persistence) {
            throw new Error('Tutorial system not initialized. Make sure TutorialOverlay component is mounted before creating tutorials.');
        }
        return this.persistence;
    }

    getOverlay(): HTMLElement {
        if (!this.overlayElement) {
            throw new Error('Tutorial overlay not found. Make sure TutorialOverlay component is mounted before starting tutorials.');
        }
        return this.overlayElement;
    }

    isInitialized(): boolean {
        return this.persistence !== null && this.overlayElement !== null;
    }
}

// Convenience function to get the tutorial system instance
export function getTutorialSystem(): TutorialSystem {
    return TutorialSystem.getInstance();
}