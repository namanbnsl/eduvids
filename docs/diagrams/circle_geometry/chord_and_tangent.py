# DIAGRAM_SCHEMA: circle_geometry_v1
# DESCRIPTION: Circle with chord and tangent line
# TOPICS: geometry, circle, chord, tangent, radius perpendicular

# Create a circle with a chord and tangent
circle_diagram = create_circle_geometry(
    radius=2.0,
    points_on_circle=[30, 150, 270],  # Three points on the circle
    point_labels=["P", "Q", "R"],
    chords=[[0, 1, "chord PQ"]],  # Chord from P to Q
    radii=[2],  # Radius to point R
    tangent_at=[2],  # Tangent line at point R
    color=BLUE,
    fill_opacity=0.1,
)

# Animate the diagram
self.play(Create(circle_diagram), run_time=2.0)
self.wait(0.5)
