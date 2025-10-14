/**
 * Manim Plugin Library System
 * 
 * Manages dynamic installation and validation of manim plugins on E2B sandboxes.
 * Plugins are installed at runtime without modifying sandbox templates.
 */

export interface PluginValidationRule {
  /** Python import statement that must be present */
  requiredImport?: string;
  /** Class inheritance patterns (regex) */
  requiredInheritance?: RegExp[];
  /** Method calls that must be present when using this plugin */
  requiredMethods?: string[];
  /** Forbidden patterns when using this plugin */
  forbiddenPatterns?: RegExp[];
  /** Custom validation function */
  customValidator?: (script: string) => { valid: boolean; error?: string };
}

export interface PluginMetadata {
  /** Plugin identifier */
  id: string;
  /** Display name */
  name: string;
  /** Pip package name(s) to install */
  pipPackages: string[];
  /** Description of what the plugin provides */
  description: string;
  /** Usage examples */
  examples: string[];
  /** Validation rules for correct usage */
  validation: PluginValidationRule;
  /** Additional dependencies or requirements */
  requirements?: string[];
  /** Version constraint (optional) */
  versionConstraint?: string;
  /** Whether this plugin is recommended for certain use cases */
  recommendedFor?: string[];
}

/**
 * Registry of available manim plugins
 */
export const MANIM_PLUGINS: Record<string, PluginMetadata> = {
  "manim-ml": {
    id: "manim-ml",
    name: "Manim Machine Learning",
    pipPackages: ["manim-ml"],
    description:
      "Provides neural network diagrams, ML visualizations, and deep learning animations. Perfect for explaining neural networks, training processes, and AI concepts.",
    examples: [
      `from manim import *
from manim_ml.neural_network import NeuralNetwork, FeedForwardLayer

class MLScene(Scene):
    def construct(self):
        # Create a simple neural network
        nn = NeuralNetwork([
            FeedForwardLayer(3),
            FeedForwardLayer(5),
            FeedForwardLayer(2)
        ])
        self.play(Create(nn))
        self.wait()`,
    ],
    validation: {
      requiredImport: "from manim_ml",
      customValidator: (script: string) => {
        if (script.includes("from manim_ml") || script.includes("import manim_ml")) {
          // Check for common classes
          const hasNNClasses =
            script.includes("NeuralNetwork") ||
            script.includes("FeedForwardLayer") ||
            script.includes("Convolutional2DLayer");

          if (!hasNNClasses) {
            return {
              valid: false,
              error:
                "manim-ml imported but no neural network classes used. Use NeuralNetwork, FeedForwardLayer, etc.",
            };
          }
        }
        return { valid: true };
      },
    },
    recommendedFor: [
      "neural networks",
      "machine learning",
      "deep learning",
      "AI concepts",
    ],
  },

  "manim-physics": {
    id: "manim-physics",
    name: "Manim Physics",
    pipPackages: ["manim-physics"],
    description:
      "Adds physics simulations including pendulums, springs, rigid bodies, and electromagnetism. Great for physics demonstrations.",
    examples: [
      `from manim import *
from manim_physics import *

class PhysicsScene(SpaceScene):
    def construct(self):
        circle = Circle().shift(UP)
        self.add(circle)
        self.make_rigid_body(circle)
        self.play(circle.animate.shift(DOWN * 3))
        self.wait(5)`,
    ],
    validation: {
      requiredImport: "from manim_physics",
      requiredInheritance: [/SpaceScene|ElectricFieldScene|MagneticFieldScene/],
      customValidator: (script: string) => {
        if (script.includes("from manim_physics") || script.includes("import manim_physics")) {
          const hasPhysicsScene =
            script.includes("SpaceScene") ||
            script.includes("ElectricFieldScene") ||
            script.includes("MagneticFieldScene");

          if (!hasPhysicsScene) {
            return {
              valid: false,
              error:
                "manim-physics requires inheriting from SpaceScene, ElectricFieldScene, or MagneticFieldScene",
            };
          }
        }
        return { valid: true };
      },
    },
    recommendedFor: [
      "physics",
      "mechanics",
      "electromagnetism",
      "simulations",
    ],
  },

  "manim-slides": {
    id: "manim-slides",
    name: "Manim Slides",
    pipPackages: ["manim-slides"],
    description:
      "Create presentation slides with manim. Useful for structured educational content with clear sections.",
    examples: [
      `from manim import *
from manim_slides import Slide

class SlideExample(Slide):
    def construct(self):
        title = Text("Introduction")
        self.play(Write(title))
        self.next_slide()
        
        content = Text("Content here")
        self.play(FadeIn(content))
        self.wait()`,
    ],
    validation: {
      requiredImport: "from manim_slides",
      requiredInheritance: [/Slide/],
      requiredMethods: ["next_slide"],
      customValidator: (script: string) => {
        if (script.includes("from manim_slides") && script.includes("Slide")) {
          if (!script.includes("next_slide()")) {
            return {
              valid: false,
              error:
                "manim-slides Slide class requires calling next_slide() to separate slides",
            };
          }
        }
        return { valid: true };
      },
    },
    recommendedFor: ["presentations", "structured lessons", "step-by-step tutorials"],
  },

  "manim-data-structures": {
    id: "manim-data-structures",
    name: "Manim Data Structures",
    pipPackages: ["manim-data-structures"],
    description:
      "Visualize common data structures like arrays, linked lists, trees, graphs, stacks, and queues.",
    examples: [
      `from manim import *
from manim_data_structures import *

class DataStructureScene(Scene):
    def construct(self):
        arr = Array([1, 2, 3, 4, 5])
        self.play(Create(arr))
        self.play(arr.animate_elem_highlight(2))
        self.wait()`,
    ],
    validation: {
      requiredImport: "from manim_data_structures",
      customValidator: (script: string) => {
        if (
          script.includes("from manim_data_structures") ||
          script.includes("import manim_data_structures")
        ) {
          const hasDataStructure =
            script.includes("Array") ||
            script.includes("LinkedList") ||
            script.includes("Tree") ||
            script.includes("Graph") ||
            script.includes("Stack") ||
            script.includes("Queue");

          if (!hasDataStructure) {
            return {
              valid: false,
              error:
                "manim-data-structures imported but no data structure classes used",
            };
          }
        }
        return { valid: true };
      },
    },
    recommendedFor: [
      "data structures",
      "algorithms",
      "computer science",
      "arrays",
      "trees",
      "graphs",
    ],
  },

  "manim-chemistry": {
    id: "manim-chemistry",
    name: "Manim Chemistry",
    pipPackages: ["manim-chemistry"],
    description:
      "Create chemical diagrams, molecular structures, and reaction animations.",
    examples: [
      `from manim import *
from manim_chemistry import *

class ChemScene(Scene):
    def construct(self):
        molecule = ChemWithName("H2O", "Water")
        self.play(Create(molecule))
        self.wait()`,
    ],
    validation: {
      requiredImport: "from manim_chemistry",
    },
    recommendedFor: ["chemistry", "molecules", "reactions", "organic chemistry"],
  },
};

/**
 * Detect which plugins are being used in a script
 */
export function detectUsedPlugins(script: string): string[] {
  const usedPlugins: string[] = [];

  for (const [pluginId, plugin] of Object.entries(MANIM_PLUGINS)) {
    const importPattern = plugin.validation.requiredImport;
    if (importPattern && script.includes(importPattern)) {
      usedPlugins.push(pluginId);
    }
  }

  return usedPlugins;
}

/**
 * Validate that a plugin is being used correctly in a script
 */
export function validatePluginUsage(
  pluginId: string,
  script: string
): { valid: boolean; errors: string[] } {
  const plugin = MANIM_PLUGINS[pluginId];
  if (!plugin) {
    return { valid: false, errors: [`Unknown plugin: ${pluginId}`] };
  }

  const errors: string[] = [];
  const validation = plugin.validation;

  // Check required import
  if (validation.requiredImport && !script.includes(validation.requiredImport)) {
    errors.push(
      `Missing required import: ${validation.requiredImport} for plugin ${plugin.name}`
    );
  }

  // Check required inheritance
  if (validation.requiredInheritance) {
    const hasRequiredInheritance = validation.requiredInheritance.some((pattern) =>
      pattern.test(script)
    );
    if (!hasRequiredInheritance) {
      errors.push(
        `Plugin ${plugin.name} requires scene to inherit from: ${validation.requiredInheritance
          .map((r) => r.source)
          .join(" or ")}`
      );
    }
  }

  // Check required methods
  if (validation.requiredMethods) {
    for (const method of validation.requiredMethods) {
      if (!script.includes(`${method}(`)) {
        errors.push(
          `Plugin ${plugin.name} requires calling method: ${method}()`
        );
      }
    }
  }

  // Check forbidden patterns
  if (validation.forbiddenPatterns) {
    for (const pattern of validation.forbiddenPatterns) {
      if (pattern.test(script)) {
        errors.push(
          `Plugin ${plugin.name} forbids pattern: ${pattern.source}`
        );
      }
    }
  }

  // Run custom validator
  if (validation.customValidator) {
    const result = validation.customValidator(script);
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate all plugins used in a script
 */
export function validateAllPlugins(script: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const usedPlugins = detectUsedPlugins(script);
  const allErrors: string[] = [];
  const warnings: string[] = [];

  for (const pluginId of usedPlugins) {
    const validation = validatePluginUsage(pluginId, script);
    if (!validation.valid) {
      allErrors.push(...validation.errors);
    }
  }

  // Check for potential plugin recommendations
  const lowerScript = script.toLowerCase();
  for (const [pluginId, plugin] of Object.entries(MANIM_PLUGINS)) {
    if (!usedPlugins.includes(pluginId) && plugin.recommendedFor) {
      const shouldRecommend = plugin.recommendedFor.some((keyword) =>
        lowerScript.includes(keyword.toLowerCase())
      );
      if (shouldRecommend) {
        warnings.push(
          `Consider using ${plugin.name} plugin for better ${plugin.recommendedFor.join(
            ", "
          )} visualizations`
        );
      }
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings,
  };
}

/**
 * Generate pip install command for a plugin
 */
export function getPluginInstallCommand(pluginId: string): string | null {
  const plugin = MANIM_PLUGINS[pluginId];
  if (!plugin) return null;

  const packages = plugin.pipPackages
    .map((pkg) =>
      plugin.versionConstraint ? `${pkg}${plugin.versionConstraint}` : pkg
    )
    .join(" ");

  return `pip install ${packages}`;
}

/**
 * Generate install commands for all detected plugins
 */
export function getPluginInstallCommands(script: string): string[] {
  const usedPlugins = detectUsedPlugins(script);
  return usedPlugins
    .map((pluginId) => getPluginInstallCommand(pluginId))
    .filter((cmd): cmd is string => cmd !== null);
}

/**
 * Get plugin documentation/guidelines for LLM prompts
 */
export function getPluginGuidelines(): string {
  const guidelines: string[] = [
    "## Available Manim Plugins\n",
    "The following plugins can be used to create enhanced animations. They will be automatically installed when detected in your code.\n",
  ];

  for (const plugin of Object.values(MANIM_PLUGINS)) {
    guidelines.push(`### ${plugin.name} (${plugin.id})`);
    guidelines.push(`${plugin.description}\n`);
    guidelines.push("**Installation:** Automatic when imported");
    guidelines.push(`**Import:** \`${plugin.validation.requiredImport}\``);

    if (plugin.recommendedFor && plugin.recommendedFor.length > 0) {
      guidelines.push(
        `**Best for:** ${plugin.recommendedFor.join(", ")}`
      );
    }

    if (plugin.examples && plugin.examples.length > 0) {
      guidelines.push("\n**Example:**");
      guidelines.push("```python");
      guidelines.push(plugin.examples[0]);
      guidelines.push("```\n");
    }

    if (plugin.validation.requiredInheritance) {
      guidelines.push(
        `**Note:** Requires scene to inherit from ${plugin.validation.requiredInheritance
          .map((r) => r.source.replace(/[\/\\]/g, ""))
          .join(" or ")}`
      );
    }

    guidelines.push("\n---\n");
  }

  return guidelines.join("\n");
}
