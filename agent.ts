import { query } from "@anthropic-ai/claude-agent-sdk";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function startSpinner() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} Thinking...`);
  }, 80);
  return () => {
    clearInterval(id);
    process.stdout.write("\r\x1b[K"); // clear the spinner line
  };
}

const agentOptions = {
  allowedTools: ["Skill", "Bash", "Read"],
  settingSources: ["project" as const],
  cwd: process.cwd(),
  permissionMode: "bypassPermissions" as const,
  allowDangerouslySkipPermissions: true,
};

async function run() {
  console.log("Hi! I'm your HR assistant. I can help you find employees or build project teams.");
  console.log('Type "exit" to quit.\n');

  while (true) {
    const userInput = await ask("You: ");

    if (userInput.trim().toLowerCase() === "exit") {
      console.log("Bye!");
      break;
    }

    if (!userInput.trim()) continue;

    const stopSpinner = startSpinner();

    for await (const message of query({
      prompt: userInput,
      options: agentOptions,
    })) {
      if ("result" in message) {
        stopSpinner();
        console.log("Assistant:", message.result, "\n");
      }
    }
  }

  rl.close();
}

run();
