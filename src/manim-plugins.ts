interface ManimPlugin {
  name: string;
  description: string;
  repository: string;
  installCommand: string;
  basicExample: string;
}

export const manimPlugins: ManimPlugin[] = [
  {
    name: "manimML",
    description:
      "ManimML is a project focused on providing animations and visualizations of common machine learning concepts with the Manim Community Library. It is a compilation of primitive visualizations that can be easily combined to create videos about complex machine learning concepts. Additionally, we want to provide a set of abstractions which allow users to focus on explanations instead of software engineering.",
    repository: "https://github.com/helblazer811/ManimML.git",
    installCommand: "pip install manim_ml",
    basicExample: `
# This is a visualization of a Convolutional Neural Network. The code needed to generate this visualization is shown below.

  from manim import *

from manim_ml.neural_network import Convolutional2DLayer, FeedForwardLayer, NeuralNetwork

# This changes the resolution of our rendered videos
config.pixel_height = 700
config.pixel_width = 1900
config.frame_height = 7.0
config.frame_width = 7.0

# Here we define our basic scene
class MyScene(ThreeDScene):

    # The code for generating our scene goes here
    def construct(self):
        # Make the neural network
        nn = NeuralNetwork([
                Convolutional2DLayer(1, 7, 3, filter_spacing=0.32),
                Convolutional2DLayer(3, 5, 3, filter_spacing=0.32),
                Convolutional2DLayer(5, 3, 3, filter_spacing=0.18),
                FeedForwardLayer(3),
                FeedForwardLayer(3),
            ],
            layer_spacing=0.25,
        )
        # Center the neural network
        nn.move_to(ORIGIN)
        self.add(nn)
        # Make a forward pass animation
        forward_pass = nn.make_forward_pass_animation()
        # Play animation
        self.play(forward_pass)
  `,
  },
];
