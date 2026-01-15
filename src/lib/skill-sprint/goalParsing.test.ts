import { describe, expect, test } from "vitest";
import { extractGoalStatement } from "./goalParsing";

describe("extractGoalStatement", () => {
	test("returns null when no goal tag exists", () => {
		expect(extractGoalStatement("No goal tag here.")).toBeNull();
	});

	test("extracts and trims goal content", () => {
		expect(extractGoalStatement("<goal>  Learn jazz guitar  </goal>")).toBe("Learn jazz guitar");
	});

	test("prefers the last goal tag when multiple exist", () => {
		const input = "<goal>First</goal>\nSome text\n<goal>Second</goal>";
		expect(extractGoalStatement(input)).toBe("Second");
	});

	test("returns null when goal tag is empty after trim", () => {
		expect(extractGoalStatement("<goal>   </goal>")).toBeNull();
	});
});
