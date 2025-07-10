import type Tutorial from "./Tutorial";

export interface TutorialStep {
	render: (context: TutorialContext) => Promise<HTMLElement[]>;
	onEnter?: (context: TutorialContext) => void | Promise<void>;
	onExit?: (context: TutorialContext) => void | Promise<void>;
	canProceed?: (context: TutorialContext) => boolean;
	target?: string; // CSS selector for positioning reference
}

export interface TutorialContext {
	tutorial: Tutorial;
	currentStep: TutorialStep;
	stepIndex: number;
	totalSteps: number;
	next: () => void;
	previous: () => void;
	skip: () => void;
	restart: () => void;
}

export interface ITutorialPersistence {
	getCompletedTutorials(): Promise<Set<string>>;
	setTutorialCompleted(tutorialId: string): Promise<void>;
	getCurrentStep(tutorialId: string): Promise<number>;
	setCurrentStep(tutorialId: string, step: number): Promise<void>;
	resetTutorial(tutorialId: string): Promise<void>;
	//TODO: Integrate with UserPrefs system for global tutorial settings
}

export interface TutorialConfig {
	id: string;
	steps: TutorialStep[];
	onComplete?: () => void;
	onSkip?: () => void;
}