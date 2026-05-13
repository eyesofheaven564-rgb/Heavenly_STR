import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { getColor } from '../../config/botConfig.js';
import { logger } from '../../utils/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────
// Channel name where /create-league is allowed (case-insensitive match).
const LEAGUES_CHANNEL_NAME = 'leagues';

// Role name that identifies a League Host (case-insensitive match).
// Hosts are assigned this role when a league thread is created so that
// /substitute and /end-league can verify ownership.
const LEAGUE_HOST_ROLE_NAME = 'League Host';

// ─── Command definition ───────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('create-league')
  .setDescription('Create a new league thread in #leagues.')
  .addStringOption((opt) =>
    opt
      .setName('game_type')
      .setDescription('The game type')
      .setRequired(true)
      .addChoices(
        { name: 'Duel', value: 'Duel' },
        { name: 'Custom Duel', value: 'Custom Duel' },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName('gamemode')
      .setDescription('The gamemode')
      .setRequired(true)
      .addChoices(
        { name: '1v1', value: '1v1' },
        { name: '2v2', value: '2v2' },
        { name: '3v3', value: '3v3' },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName('private_server_link')
      .setDescription('Invite link or code for the private server')
      .setRequired(true),
  );

// ─── Execute ──────────────────────────────────────────────────────────────────
export async function execute(interaction) {
  // 1. Channel restriction – must be used inside #leagues.
  const channel = interaction.channel;
  if (
    !channel ||
    channel.type !== ChannelType.GuildText ||
    channel.name.toLowerCase() !== LEAGUES_CHANNEL_NAME
  ) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor('error'))
          .setTitle('Wrong Channel')
          .setDescription(
            `This command can only be used in **#${LEAGUES_CHANNEL_NAME}**.`,
          )
          .setFooter({ text: 'Titan Bot' }),
      ],
      ephemeral: true,
    });
  }

  // 2. Collect options.
  const gameType = interaction.options.getString('game_type');
  const gamemode = interaction.options.getString('gamemode');
  const privateServerLink = interaction.options.getString('private_server_link');
  const host = interaction.member;

  // 3. Defer so we have time for thread creation + pinning.
  await interaction.deferReply({ ephemeral: true });

  try {
    // 4. Create a public thread in #leagues.
    const threadName = `${gameType} | ${gamemode} League`;
    const thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: 10080, // 7 days
      type: ChannelType.PublicThread,
      reason: `League created by ${host.user.tag}`,
    });

    // 5. Build the league embed.
    const embed = new EmbedBuilder()
      .setColor(getColor('primary'))
      .setTitle(`🏆 ${threadName}`)
      .addFields(
        { name: '🎮 Game Type', value: gameType, inline: true },
        { name: '⚔️ Gamemode', value: gamemode, inline: true },
        { name: '🔗 Private Server', value: privateServerLink, inline: false },
        {
          name: '👑 Host',
          value: `${host}`,
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: 'Titan Bot' });

    // 6. Post the embed inside the thread and pin it.
    const pinMessage = await thread.send({ embeds: [embed] });
    await pinMessage.pin();

    // 7. Assign the League Host role to the command invoker if the role exists.
    //    (Best-effort – skip silently if the role hasn't been set up yet.)
    const hostRole = interaction.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === LEAGUE_HOST_ROLE_NAME.toLowerCase(),
    );
    if (hostRole) {
      try {
        await host.roles.add(hostRole, `Hosting league: ${threadName}`);
      } catch (roleErr) {
        logger.warn(
          `[create-league] Could not assign League Host role: ${roleErr.message}`,
        );
      }
    }

    // 8. Confirm to the caller.
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor('success'))
          .setTitle('✅ League Created')
          .setDescription(
            `Thread **${threadName}** has been created and pinned in <#${channel.id}>.`,
          )
          .addFields({ name: '📌 Thread', value: `<#${thread.id}>` })
          .setFooter({ text: 'Titan Bot' }),
      ],
    });

    logger.info(
      `[create-league] "${threadName}" created by ${host.user.tag} in #${channel.name}`,
    );
  } catch (err) {
    logger.error(`[create-league] Error: ${err.message}`);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(getColor('error'))
          .setTitle('Error')
          .setDescription(
            'Something went wrong while creating the league. Please try again.',
          )
          .setFooter({ text: 'Titan Bot' }),
      ],
    });
  }
}

export default { data, execute };
