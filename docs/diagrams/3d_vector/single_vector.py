# DIAGRAM_SCHEMA: 3d_axes_vector_v1
# DESCRIPTION: Single 3D vector on coordinate axes
# TOPICS: vectors, 3d, linear algebra
# REQUIRES: class MyScene(VoiceoverScene, ThreeDScene)

# Create a 3D vector visualization
# NOTE: This requires the scene to inherit from ThreeDScene
vectors = create_3d_axes_vector(
    vectors=[
        {"components": [2, 1, 3], "color": BLUE, "label": "v"},
    ],
    x_range=(-3, 3, 1),
    y_range=(-3, 3, 1),
    z_range=(-1, 4, 1),
    show_unit_vectors=False,
    axis_length=4,
)

# Configure 3D camera for proper viewing angle
configure_3d_camera(self, focus=vectors, phi=70, theta=-45)

# Animate the vectors
self.play(Create(vectors), run_time=2.0)
self.wait(0.5)
