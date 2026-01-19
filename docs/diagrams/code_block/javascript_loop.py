# DIAGRAM_SCHEMA: code_block_v1
# DESCRIPTION: JavaScript loop example with syntax highlighting
# TOPICS: programming, javascript, loop, iteration

# Create a code block showing a JavaScript for loop
code = create_code_block(
    code_str='''// Sum numbers from 1 to 10
let sum = 0;

for (let i = 1; i <= 10; i++) {
    sum += i;
    console.log(`Running total: ${sum}`);
}

console.log(`Final sum: ${sum}`);''',
    language="javascript",
    style="monokai",
    font_size=18,
)

# Animate the code block
self.play(FadeIn(code), run_time=1.5)
self.wait(0.5)
