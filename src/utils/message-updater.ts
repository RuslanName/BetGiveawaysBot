import { Context } from 'telegraf';

export const updateOrSendMessage = async (
    ctx: Context,
    text: string,
    options?: {
        parse_mode?: 'Markdown' | 'HTML';
        reply_markup?: any;
        photo?: string;
    }
): Promise<void> => {
    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const message = ctx.callbackQuery.message as any;
            
            if (options?.photo) {
                if (message.photo) {
                    try {
                        await ctx.telegram.editMessageCaption(
                            message.chat.id,
                            message.message_id,
                            undefined,
                            text,
                            {
                                parse_mode: options.parse_mode,
                                reply_markup: options.reply_markup
                            }
                        );
                        return;
                    } catch (error) {
                        await ctx.deleteMessage();
                    }
                } else {
                    await ctx.deleteMessage();
                }
            } else {
                if (message.photo) {
                    await ctx.deleteMessage();
                } else {
                    try {
                        await ctx.editMessageText(text, {
                            parse_mode: options?.parse_mode,
                            reply_markup: options?.reply_markup
                        });
                        return;
                    } catch (error) {
                        await ctx.deleteMessage();
                    }
                }
            }
        }
        
        if (options?.photo) {
            await ctx.replyWithPhoto(options.photo, {
                caption: text,
                parse_mode: options.parse_mode,
                reply_markup: options.reply_markup
            });
        } else {
            await ctx.reply(text, {
                parse_mode: options?.parse_mode,
                reply_markup: options?.reply_markup
            });
        }
    } catch (error) {
        console.error('Error updating message:', error);
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.deleteMessage();
            }
        } catch (deleteError) {
            // Ignore delete errors
        }
        
        if (options?.photo) {
            await ctx.replyWithPhoto(options.photo, {
                caption: text,
                parse_mode: options?.parse_mode,
                reply_markup: options?.reply_markup
            });
        } else {
            await ctx.reply(text, {
                parse_mode: options?.parse_mode,
                reply_markup: options?.reply_markup
            });
        }
    }
};

