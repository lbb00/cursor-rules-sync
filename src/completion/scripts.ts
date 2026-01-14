/**
 * Shell completion scripts for bash, zsh, and fish
 */

export const bashScript = `
# ais bash completion
_ais_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local pprev="\${COMP_WORDS[COMP_CWORD-2]}"
  local ppprev="\${COMP_WORDS[COMP_CWORD-3]}"

  # cursor commands add
  if [[ "\$ppprev" == "cursor" && "\$pprev" == "commands" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor-commands 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor add
  if [[ "\$pprev" == "cursor" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # copilot add
  if [[ "\$pprev" == "copilot" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete copilot 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # claude skills add
  if [[ "\$ppprev" == "claude" && "\$pprev" == "skills" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete claude-skills 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # claude agents add
  if [[ "\$ppprev" == "claude" && "\$pprev" == "agents" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete claude-agents 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor skills add
  if [[ "\$ppprev" == "cursor" && "\$pprev" == "skills" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor-skills 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor rules add
  if [[ "\$pprev" == "rules" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor commands
  if [[ "\$pprev" == "cursor" && "\$prev" == "commands" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import" -- "\$cur") )
    return 0
  fi

  # cursor skills
  if [[ "\$pprev" == "cursor" && "\$prev" == "skills" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import" -- "\$cur") )
    return 0
  fi

  # cursor rules
  if [[ "\$pprev" == "cursor" && "\$prev" == "rules" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import" -- "\$cur") )
    return 0
  fi

  # claude skills
  if [[ "\$pprev" == "claude" && "\$prev" == "skills" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import" -- "\$cur") )
    return 0
  fi

  # claude agents
  if [[ "\$pprev" == "claude" && "\$prev" == "agents" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "cursor" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import rules commands skills" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "copilot" ]]; then
    COMPREPLY=( $(compgen -W "add remove install import" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "claude" ]]; then
    COMPREPLY=( $(compgen -W "skills agents install" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "ais" ]]; then
    COMPREPLY=( $(compgen -W "cursor copilot claude use list git add remove install import completion" -- "\$cur") )
    return 0
  fi
}
complete -F _ais_complete ais
`;

export const zshScript = `
# ais zsh completion
_ais() {
  local -a subcmds
subcmds=(
    'cursor:Manage Cursor rules, commands, and skills'
    'copilot:Manage Copilot instructions'
    'claude:Manage Claude skills, agents, and plugins'
    'use:Configure rules repository'
    'list:List configured repositories'
    'git:Run git commands in rules repository'
    'add:Add a rule (smart dispatch)'
    'remove:Remove a rule (smart dispatch)'
    'install:Install all rules (smart dispatch)'
    'import:Import entry to rules repository'
    'completion:Output shell completion script'
  )

  local -a cursor_subcmds copilot_subcmds claude_subcmds cursor_rules_subcmds cursor_commands_subcmds cursor_skills_subcmds claude_skills_subcmds claude_agents_subcmds
  cursor_subcmds=('add:Add a Cursor rule' 'remove:Remove a Cursor rule' 'install:Install all Cursor entries' 'import:Import entry to repository' 'rules:Manage rules explicitly' 'commands:Manage commands' 'skills:Manage skills')
  copilot_subcmds=('add:Add a Copilot instruction' 'remove:Remove a Copilot instruction' 'install:Install all Copilot instructions' 'import:Import instruction to repository')
  claude_subcmds=('skills:Manage Claude skills' 'agents:Manage Claude agents' 'install:Install all Claude components')
  cursor_rules_subcmds=('add:Add a Cursor rule' 'remove:Remove a Cursor rule' 'install:Install all Cursor rules' 'import:Import rule to repository')
  cursor_commands_subcmds=('add:Add a Cursor command' 'remove:Remove a Cursor command' 'install:Install all Cursor commands' 'import:Import command to repository')
  cursor_skills_subcmds=('add:Add a Cursor skill' 'remove:Remove a Cursor skill' 'install:Install all Cursor skills' 'import:Import skill to repository')
  claude_skills_subcmds=('add:Add a Claude skill' 'remove:Remove a Claude skill' 'install:Install all Claude skills' 'import:Import skill to repository')
  claude_agents_subcmds=('add:Add a Claude agent' 'remove:Remove a Claude agent' 'install:Install all Claude agents' 'import:Import agent to repository')

  _arguments -C \\
    '1:command:->command' \\
    '2:subcommand:->subcommand' \\
    '3:subsubcommand:->subsubcommand' \\
    '4:name:->name' \\
    '*::arg:->args'

  case "\$state" in
    command)
      _describe 'command' subcmds
      ;;
    subcommand)
      case "\$words[2]" in
        cursor)
          _describe 'subcommand' cursor_subcmds
          ;;
        copilot)
          _describe 'subcommand' copilot_subcmds
          ;;
        claude)
          _describe 'subcommand' claude_subcmds
          ;;
      esac
      ;;
    subsubcommand)
      case "\$words[2]" in
        cursor)
          case "\$words[3]" in
            add)
              local -a rules
              rules=(\${(f)"\$(ais _complete cursor 2>/dev/null)"})
              if (( \$#rules )); then
                compadd "\$rules[@]"
              fi
              ;;
            rules)
              _describe 'subsubcommand' cursor_rules_subcmds
              ;;
            commands)
              _describe 'subsubcommand' cursor_commands_subcmds
              ;;
            skills)
              _describe 'subsubcommand' cursor_skills_subcmds
              ;;
            *)
              _describe 'subsubcommand' cursor_subcmds
              ;;
          esac
          ;;
        copilot)
          case "\$words[3]" in
            add)
              local -a instructions
              instructions=(\${(f)"\$(ais _complete copilot 2>/dev/null)"})
              if (( \$#instructions )); then
                compadd "\$instructions[@]"
              fi
              ;;
            *)
              _describe 'subsubcommand' copilot_subcmds
              ;;
          esac
          ;;
        claude)
          case "\$words[3]" in
            skills)
              _describe 'subsubcommand' claude_skills_subcmds
              ;;
            agents)
              _describe 'subsubcommand' claude_agents_subcmds
              ;;
            *)
              _describe 'subsubcommand' claude_subcmds
              ;;
          esac
          ;;
      esac
      ;;
    name)
      case \"\$words[2]\" in
        cursor)
          case \"\$words[3]\" in
            add)
              local -a rules
              rules=(\${(f)\"$(ais _complete cursor 2>/dev/null)\"})
              if (( \$#rules )); then
                compadd \"\$rules[@]\"
              fi
              ;;
            rules)
              case \"\$words[4]\" in
                add)
                  local -a rules
                  rules=(\${(f)\"$(ais _complete cursor 2>/dev/null)\"})
                  if (( \$#rules )); then
                    compadd \"\$rules[@]\"
                  fi
                  ;;
              esac
              ;;
            commands)
              case "\$words[4]" in
                add)
                  local -a commands
                  commands=(\${(f)"$(ais _complete cursor-commands 2>/dev/null)"})
                  if (( \$#commands )); then
                    compadd "\$commands[@]"
                  fi
                  ;;
              esac
              ;;
            skills)
              case \"\$words[4]\" in
                add)
                  local -a skills
                  skills=(\${(f)\"$(ais _complete cursor-skills 2>/dev/null)\"})
                  if (( \$#skills )); then
                    compadd \"\$skills[@]\"
                  fi
                  ;;
              esac
              ;;
          esac
          ;;
        copilot)
          case \"\$words[3]\" in
            add)
              local -a instructions
              instructions=(\${(f)\"$(ais _complete copilot 2>/dev/null)\"})
              if (( \$#instructions )); then
                compadd \"\$instructions[@]\"
              fi
              ;;
          esac
          ;;
        claude)
          case \"\$words[3]\" in
            skills)
              case \"\$words[4]\" in
                add)
                  local -a skills
                  skills=(\${(f)\"$(ais _complete claude-skills 2>/dev/null)\"})
                  if (( \$#skills )); then
                    compadd \"\$skills[@]\"
                  fi
                  ;;
              esac
              ;;
            agents)
              case \"\$words[4]\" in
                add)
                  local -a agents
                  agents=(\${(f)\"$(ais _complete claude-agents 2>/dev/null)\"})
                  if (( \$#agents )); then
                    compadd \"\$agents[@]\"
                  fi
                  ;;
              esac
              ;;
          esac
          ;;
      esac
      ;;
    args)
      # Handle additional arguments
      ;;
  esac
}

# Only define completion if compdef is available (zsh completion initialized)
command -v compdef >/dev/null 2>&1 && compdef _ais ais
`;

export const fishScript = `
# ais fish completion
complete -c ais -f

# Top-level commands
complete -c ais -n "__fish_use_subcommand" -a "cursor" -d "Manage Cursor rules, commands, and skills"
complete -c ais -n "__fish_use_subcommand" -a "copilot" -d "Manage Copilot instructions"
complete -c ais -n "__fish_use_subcommand" -a "claude" -d "Manage Claude skills, agents, and plugins"
complete -c ais -n "__fish_use_subcommand" -a "use" -d "Configure rules repository"
complete -c ais -n "__fish_use_subcommand" -a "list" -d "List configured repositories"
complete -c ais -n "__fish_use_subcommand" -a "git" -d "Run git commands in rules repository"
complete -c ais -n "__fish_use_subcommand" -a "add" -d "Add a rule (smart dispatch)"
complete -c ais -n "__fish_use_subcommand" -a "remove" -d "Remove a rule (smart dispatch)"
complete -c ais -n "__fish_use_subcommand" -a "install" -d "Install all rules (smart dispatch)"
complete -c ais -n "__fish_use_subcommand" -a "import" -d "Import entry to rules repository"
complete -c ais -n "__fish_use_subcommand" -a "completion" -d "Output shell completion script"

# cursor subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "add" -d "Add a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "remove" -d "Remove a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "install" -d "Install all Cursor entries"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "import" -d "Import entry to repository"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "rules" -d "Manage rules explicitly"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "commands" -d "Manage commands"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install import rules commands skills" -a "skills" -d "Manage skills"

# cursor rules subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install import" -a "add" -d "Add a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install import" -a "remove" -d "Remove a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install import" -a "install" -d "Install all Cursor rules"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install import" -a "import" -d "Import rule to repository"

# cursor commands subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install import" -a "add" -d "Add a Cursor command"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install import" -a "remove" -d "Remove a Cursor command"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install import" -a "install" -d "Install all Cursor commands"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install import" -a "import" -d "Import command to repository"

# cursor skills subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "add" -d "Add a Cursor skill"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "remove" -d "Remove a Cursor skill"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "install" -d "Install all Cursor skills"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "import" -d "Import skill to repository"

# copilot subcommands
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install import" -a "add" -d "Add a Copilot instruction"
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install import" -a "remove" -d "Remove a Copilot instruction"
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install import" -a "install" -d "Install all Copilot instructions"
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install import" -a "import" -d "Import instruction to repository"

# claude subcommands
complete -c ais -n "__fish_seen_subcommand_from claude; and not __fish_seen_subcommand_from skills agents install" -a "skills" -d "Manage Claude skills"
complete -c ais -n "__fish_seen_subcommand_from claude; and not __fish_seen_subcommand_from skills agents install" -a "agents" -d "Manage Claude agents"
complete -c ais -n "__fish_seen_subcommand_from claude; and not __fish_seen_subcommand_from skills agents install" -a "install" -d "Install all Claude components"

# claude skills subcommands
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "add" -d "Add a Claude skill"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "remove" -d "Remove a Claude skill"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "install" -d "Install all Claude skills"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install import" -a "import" -d "Import skill to repository"

# claude agents subcommands
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install import" -a "add" -d "Add a Claude agent"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install import" -a "remove" -d "Remove a Claude agent"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install import" -a "install" -d "Install all Claude agents"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install import" -a "import" -d "Import agent to repository"

complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from add" -a "(ais _complete cursor 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and __fish_seen_subcommand_from add" -a "(ais _complete cursor 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and __fish_seen_subcommand_from add" -a "(ais _complete cursor-commands 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and __fish_seen_subcommand_from add" -a "(ais _complete cursor-skills 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from copilot; and __fish_seen_subcommand_from add" -a "(ais _complete copilot 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and __fish_seen_subcommand_from add" -a "(ais _complete claude-skills 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and __fish_seen_subcommand_from add" -a "(ais _complete claude-agents 2>/dev/null)"
`;

/**
 * Get the completion script for a shell
 */
export function getCompletionScript(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'bash':
      return bashScript.trim();
    case 'zsh':
      return zshScript.trim();
    case 'fish':
      return fishScript.trim();
    default:
      throw new Error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
  }
}
