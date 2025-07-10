import TutorialSystem from "./TutorialSystem";
import type { TutorialConfig, TutorialContext, TutorialStep } from "./types";

export default class Tutorial {
    public readonly id: string;
    public readonly steps: TutorialStep[];
    public readonly onComplete?: () => void;
    public readonly onSkip?: () => void;

    private currentStep = $state(0);
    private isActive = $state(false);
    private mountedElements: HTMLElement[] = [];
    private tutorialSystem = TutorialSystem.getInstance();

    constructor(config: TutorialConfig) {
        this.id = config.id;
        this.steps = config.steps;
        this.onComplete = config.onComplete;
        this.onSkip = config.onSkip;
    }

    get active(): boolean {
        return this.isActive;
    }

    get currentStepIndex(): number {
        return this.currentStep;
    }

    async start(): Promise<void> {
        const persistence = this.tutorialSystem.getPersistence();

        const completed = await persistence.getCompletedTutorials();
        if (completed.has(this.id)) {
            // Offer to restart or skip
            return this.offerRestart();
        }

        const savedStep = await persistence.getCurrentStep(this.id);
        if (savedStep > 0) {
            // Offer to continue, restart, or skip
            return this.offerContinue(savedStep);
        }

        this.currentStep = 0;
        this.isActive = true;
        await this.renderCurrentStep();
    }

    async next(): Promise<void> {
        if (this.currentStep < this.steps.length - 1) {
            await this.exitCurrentStep();
            this.currentStep++;
            await this.tutorialSystem.getPersistence().setCurrentStep(this.id, this.currentStep);
            await this.renderCurrentStep();
        } else {
            await this.complete();
        }
    }

    async previous(): Promise<void> {
        if (this.currentStep > 0) {
            await this.exitCurrentStep();
            this.currentStep--;
            await this.tutorialSystem.getPersistence().setCurrentStep(this.id, this.currentStep);
            await this.renderCurrentStep();
        }
    }

    async skip(): Promise<void> {
        await this.exitCurrentStep();
        await this.tutorialSystem.getPersistence().setTutorialCompleted(this.id);
        this.isActive = false;
        this.onSkip?.();
    }

    async restart(): Promise<void> {
        await this.exitCurrentStep();
        await this.tutorialSystem.getPersistence().resetTutorial(this.id);
        this.currentStep = 0;
        this.isActive = true;
        await this.renderCurrentStep();
    }

    async complete(): Promise<void> {
        await this.exitCurrentStep();
        await this.tutorialSystem.getPersistence().setTutorialCompleted(this.id);
        this.isActive = false;
        this.onComplete?.();
    }

    async isCompleted(): Promise<boolean> {
        const completed = await this.tutorialSystem.getPersistence().getCompletedTutorials();
        return completed.has(this.id);
    }

    private async renderCurrentStep(): Promise<void> {
        const step = this.steps[this.currentStep];
        const context: TutorialContext = {
            tutorial: this,
            currentStep: step,
            stepIndex: this.currentStep,
            totalSteps: this.steps.length,
            next: () => this.next(),
            previous: () => this.previous(),
            skip: () => this.skip(),
            restart: () => this.restart()
        };

        await step.onEnter?.(context);
        const elements = await step.render(context);

        if (elements && elements.length > 0) {
            this.mountTutorialElements(elements);
        }
    }

    private async exitCurrentStep(): Promise<void> {
        const step = this.steps[this.currentStep];
        const context: TutorialContext = {
            tutorial: this,
            currentStep: step,
            stepIndex: this.currentStep,
            totalSteps: this.steps.length,
            next: () => this.next(),
            previous: () => this.previous(),
            skip: () => this.skip(),
            restart: () => this.restart()
        };

        await step.onExit?.(context);
        this.unmountTutorialElements();
    }

    private mountTutorialElements(elements: HTMLElement[]): void {
        const overlay = this.tutorialSystem.getOverlay();

        this.mountedElements = elements;
        elements.forEach(element => {
            overlay.appendChild(element);
        });
    }

    private unmountTutorialElements(): void {
        this.mountedElements.forEach(element => {
            element.remove();
        });
        this.mountedElements = [];
    }

    private async offerRestart(): Promise<void> {
        // TODO: Show restart dialog
        // For now, just skip
        console.log('Tutorial already completed. Skipping...');
    }

    private async offerContinue(savedStep: number): Promise<void> {
        // TODO: Show continue dialog
        // For now, just continue from saved step
        this.currentStep = savedStep;
        this.isActive = true;
        await this.renderCurrentStep();
    }
}
