import type { ITutorialPersistence } from "./types";

export default class LocalStorageTutorialPersistence implements ITutorialPersistence {
    private readonly COMPLETED_KEY = 'tutorial_completed';
    private readonly STEP_KEY = 'tutorial_step';

    async getCompletedTutorials(): Promise<Set<string>> {
        const completed = localStorage.getItem(this.COMPLETED_KEY);
        return completed ? new Set(JSON.parse(completed)) : new Set();
    }

    async setTutorialCompleted(tutorialId: string): Promise<void> {
        const completed = await this.getCompletedTutorials();
        completed.add(tutorialId);
        localStorage.setItem(this.COMPLETED_KEY, JSON.stringify([...completed]));

        // Clean up step tracking
        localStorage.removeItem(`${this.STEP_KEY}_${tutorialId}`);
    }

    async getCurrentStep(tutorialId: string): Promise<number> {
        const step = localStorage.getItem(`${this.STEP_KEY}_${tutorialId}`);
        return step ? parseInt(step, 10) : 0;
    }

    async setCurrentStep(tutorialId: string, step: number): Promise<void> {
        localStorage.setItem(`${this.STEP_KEY}_${tutorialId}`, step.toString());
    }

    async resetTutorial(tutorialId: string): Promise<void> {
        const completed = await this.getCompletedTutorials();
        completed.delete(tutorialId);
        localStorage.setItem(this.COMPLETED_KEY, JSON.stringify([...completed]));
        localStorage.removeItem(`${this.STEP_KEY}_${tutorialId}`);
    }
}