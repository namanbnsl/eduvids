# DIAGRAM_SCHEMA: 3d_axes_vector_v1
# DESCRIPTION: Unit basis vectors i, j, k
# TOPICS: vectors, basis, unit vectors, i j k
# REQUIRES: class MyScene(VoiceoverScene, ThreeDScene)

# Create 3D axes with unit basis vectors
vectors = create_3d_axes_vector(
    vectors=[],
    x_range=(-2, 2, 1),
    y_range=(-2, 2, 1),
    z_range=(-2, 2, 1),
    show_unit_vectors=True,
    axis_length=3,
)

# Configure 3D camera
configure_3d_camera(self, focus=vectors, phi=65, theta=-50)

# Animate the vectors
self.play(Create(vectors), run_time=2.0)
self.wait(0.5)

# Optionally orbit the camera to show all dimensions
orbit_camera_around(self, vectors, angle=TAU / 4, run_time=3)
self.wait(0.5)
