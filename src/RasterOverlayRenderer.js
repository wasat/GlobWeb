/***************************************
 * Copyright 2011, 2012 GlobWeb contributors.
 *
 * This file is part of GlobWeb.
 *
 * GlobWeb is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, version 3 of the License, or
 * (at your option) any later version.
 *
 * GlobWeb is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GlobWeb. If not, see <http://www.gnu.org/licenses/>.
 ***************************************/

//*************************************************************************

/** 
	@constructor
 */
GlobWeb.RasterOverlayRenderer = function(tileManager)
{
	var vertexShader = "\
	attribute vec3 vertex;\n\
	attribute vec2 tcoord;\n\
	uniform mat4 modelViewMatrix;\n\
	uniform mat4 projectionMatrix;\n\
	uniform vec4 textureTransform; \n\
	\
	varying vec2 texCoord;\n\
	\
	void main(void) \n\
	{\n\
		gl_Position = projectionMatrix * modelViewMatrix * vec4(vertex, 1.0);\n\
		texCoord = tcoord * textureTransform.xy + textureTransform.zw;\n\
	}\n\
	";

	var fragmentShader = "\
	#ifdef GL_ES\n\
	precision highp float;\n\
	#endif\n\
	\n\
	varying vec2 texCoord;\n\
	uniform sampler2D overlayTexture;\n\
	uniform float opacity; \n\
	\n\
	void main(void)\n\
	{\n\
		gl_FragColor.rgba = texture2D(overlayTexture, texCoord.xy); \n\
		gl_FragColor.a *= opacity; \n\
	}\n\
	";
	
	this.requestHighestResolutionFirst = true;
	this.tileManager = tileManager;
	
    this.program = new GlobWeb.Program(tileManager.renderContext);
	this.program.createFromSource( vertexShader, fragmentShader );
	
	this.overlays = [];
	this.imageRequests = [];
	this.frameNumber = 0;
	
	
	var self = this;
	for ( var i = 0; i < 2; i++ ) {
		var image = new Image();
		image.renderable = null;
		image.frameNumber = -1;
		image.crossOrigin = '';
		image.onload = function() 
		{
			//console.log("Load " + this.src);
			this.renderable.texture = tileManager.tilePool.createGLTexture(this);
			this.renderable.request = null;
			this.renderable.requestFinished = true;
			this.renderable = null;
			self.tileManager.renderContext.requestFrame();
		};
		image.onerror = function()
		{
			if ( this.renderable )
			{
				this.renderable.request = null;
				this.renderable.requestFinished = true;
				this.renderable = null;
			}
		};
		image.onabort = function()
		{
			console.log("Raster overlay request abort.");
			if ( this.renderable )
			{
				this.renderable.request = null;
				this.renderable = null;
			}
		};
		
		this.imageRequests.push( image );
	}

	
	this.needsOffset = true;
}

/**************************************************************************************************************/

/** 
	@constructor
	Create a renderable for the overlay.
	There is one renderable per overlay and per tile.
 */
GlobWeb.RasterOverlayRenderable = function( overlay )
{
	this.overlay = overlay;
	this.texture = null;
	this.request = null;
	this.requestFinished = false;
}

/**************************************************************************************************************/

/** 
	Dispose the renderable
 */
GlobWeb.RasterOverlayRenderable.prototype.dispose = function(renderContext,tilePool)
{
	if ( this.texture ) 
	{
		tilePool.disposeGLTexture(this.texture);
		this.texture = null;
	}
}


/**************************************************************************************************************/

/** 
	@constructor
	Create tile data for the Raster overlay renderer.
	The tile data is just an array of renderables.
 */
GlobWeb.RasterOverlayRenderer.TileData = function()
{
	this.renderables = [];
}

/**************************************************************************************************************/

/** 
	Find the renderable of an overlay on a tile
 */
GlobWeb.RasterOverlayRenderer.TileData.prototype.findRenderable = function(overlay)
{
	for ( var i = 0; i < this.renderables.length; i++ )
	{
		var r = this.renderables[i];
		if ( r.overlay == overlay ) 
			return r;
	}
	
	return null;
}

/**************************************************************************************************************/

/** 
	Dispose tile data. Just dispose all renderables.
 */
GlobWeb.RasterOverlayRenderer.TileData.prototype.dispose = function(renderContext,tilePool)
{
	for ( var i = 0; i < this.renderables.length; i++ )
	{
		this.renderables[i].dispose(renderContext,tilePool);
	}
}

/**************************************************************************************************************/

/**
	Add an overlay into the renderer.
	The overlay is added to all loaded tiles.
 */
GlobWeb.RasterOverlayRenderer.prototype.addOverlay = function( overlay )
{
	this.overlays.push( overlay );
	for ( var i = 0; i < this.tileManager.level0Tiles.length; i++ )
	{
		var tile = this.tileManager.level0Tiles[i];
		if ( tile.state == GlobWeb.Tile.State.LOADED )
		{
			this.addOverlayToTile( tile, overlay );
		}
	}
}

/**************************************************************************************************************/

/**
	Remove an overlay
	The overlay is removed from all loaded tiles.
 */
GlobWeb.RasterOverlayRenderer.prototype.removeOverlay = function( overlay )
{
	var index = this.overlays.indexOf( overlay );
	this.overlays.splice(index,1);
	
	var rc = this.tileManager.renderContext;
	var tp = this.tileManager.tilePool;
	this.tileManager.visitTiles( function(tile) 
			{
				var rs = tile.extension.rasterOverlay;
				var renderable = rs ?  rs.findRenderable( overlay ) : null;
				if ( renderable ) 
				{
					// Remove the renderable
					var index = rs.renderables.indexOf(renderable);
					rs.renderables.splice(index,1);
					
					// Dispose its data
					renderable.dispose(rc,tp);
					
					// Remove tile data if not needed anymore
					if ( rs.renderables.length == 0 )
						delete tile.extension.rasterOverlay;
				}
			}
	);
}

/**************************************************************************************************************/

/**
	Add an overlay into a tile.
	Create tile data if needed, and create the renderable for the overlay.
 */
GlobWeb.RasterOverlayRenderer.prototype.addOverlayToTile = function( tile, overlay )
{
	if ( !tile.extension.rasterOverlay )
		tile.extension.rasterOverlay = new GlobWeb.RasterOverlayRenderer.TileData();
	
	tile.extension.rasterOverlay.renderables.push( new GlobWeb.RasterOverlayRenderable(overlay) );
	
	if ( tile.children )
	{
		// Add the overlay to loaded children
		for ( var i = 0; i < 4; i++ )
		{
			if ( tile.children[i].state == GlobWeb.Tile.State.LOADED
					&& this.overlayIntersects( tile.children[i].geoBound, overlay ) )
			{
				this.addOverlayToTile( tile.children[i], overlay );
			}
		}
	}

}

/**************************************************************************************************************/

/**
	Create an interpolated for polygon clipping
 */	
GlobWeb.RasterOverlayRenderer.prototype.createInterpolatedVertex = function( t, p1, p2 )
{
	return [ p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]) ];
}

/**************************************************************************************************************/

/**
	Clip polygon to a side (used by bound-overlay intersection)
 */	
GlobWeb.RasterOverlayRenderer.prototype.clipPolygonToSide = function( coord, sign, value, polygon )
{
	var clippedPolygon = [];

	// iterate through vertices
	for ( var i = 0; i < polygon.length; i++ )
	{
		var p1 = polygon[i];
		var p2 = polygon[ (i+1) % polygon.length ];
		var val1 = p1[coord];
		var val2 = p2[coord];

		// test containement
		var firstInside = (val1 - value) * sign >= 0.0;
		var secondInside = (val2 - value) * sign >= 0.0;
	
		// output vertices for inside polygon
		if ( !firstInside && secondInside )
		{
			var t = (value - val1) / (val2- val1);
			var newPoint = this.createInterpolatedVertex( t, p1, p2 );
			clippedPolygon.push( newPoint );
			clippedPolygon.push( p2 );
		}
		else if ( firstInside && secondInside )
		{
			clippedPolygon.push( p2 );
		}
		else if ( firstInside && !secondInside )
		{
			var t = (value - val1) / (val2- val1);
			var newPoint = this.createInterpolatedVertex( t, p1, p2 );
			clippedPolygon.push( newPoint );
		}
	}
	
	return clippedPolygon;
}

/**************************************************************************************************************/

/**
	Check the intersection between a geo bound and an overlay
 */	
GlobWeb.RasterOverlayRenderer.prototype.overlayIntersects = function( bound, overlay )
{
	if ( overlay.coordinates )
	{
		var c;
		c = this.clipPolygonToSide( 0, 1, bound.west, overlay.coordinates );
		c = this.clipPolygonToSide( 0, -1, bound.east, c );
		c = this.clipPolygonToSide( 1, 1, bound.south, c );
		c = this.clipPolygonToSide( 1, -1, bound.north, c );
		return c.length > 0;
	}
	else if ( overlay.geoBound )
	{
		return overlay.geoBound.intersects( bound );
	}
	
	// No geobound or coordinates : always return true
	return true;
}

/**************************************************************************************************************/

/**
	Generate Raster overlay data on the tile.
	The method is called by TileManager when a new tile has been generated.
 */
GlobWeb.RasterOverlayRenderer.prototype.generate = function( tile )
{
	if ( tile.parent )
	{	
		// Only add feature from parent tile (if any)
		var data = tile.parent.extension.rasterOverlay;
		var rl = data ?  data.renderables.length : 0;
		for ( var i = 0; i < rl; i++ )
		{
			var overlay = data.renderables[i].overlay;		
			if ( this.overlayIntersects( tile.geoBound, overlay ) )
				this.addOverlayToTile(tile,overlay);
		}
	}
	else
	{
		// Traverse all overlays
		for ( var i = 0; i < this.overlays.length; i++ )
		{
			var overlay = this.overlays[i];
			if ( this.overlayIntersects( tile.geoBound, overlay ) )
				this.addOverlayToTile(tile,overlay);
		}
	}
}

/**************************************************************************************************************/

/**
	Request the overlay texture for a tile
 */
GlobWeb.RasterOverlayRenderer.prototype.requestOverlayTextureForTile = function( tile, renderable )
{	
	if ( !renderable.request )
	{
		var imageRequest;
		for ( var i = 0; i < this.imageRequests.length; i++ )
		{
			if ( !this.imageRequests[i].renderable  ) 
			{
				imageRequest = this.imageRequests[i];
				break;
			}
		}
		
		if ( imageRequest )
		{
			imageRequest.renderable = renderable;
			renderable.request = imageRequest;
			imageRequest.frameNumber = this.frameNumber;
			imageRequest.src = renderable.overlay.getUrl(tile);
		}
	}
	else
	{
		renderable.request.frameNumber = this.frameNumber;
	}
}

//*************************************************************************

/**
 *	Render the raster overlays for the given tiles
 */
GlobWeb.RasterOverlayRenderer.prototype.render = function( tiles )
{
	// First check if there is someting to do
	if ( this.overlays.length == 0 )
		return;
		
	var rc = this.tileManager.renderContext;
 	var gl = rc.gl;

	// Setup program
    this.program.apply();
	
	var attributes = this.program.attributes;
		
	gl.uniformMatrix4fv(this.program.uniforms["projectionMatrix"], false, rc.projectionMatrix);
	gl.uniform1i(this.program.uniforms["overlayTexture"], 0);
	gl.enable(gl.BLEND);
	gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
	gl.depthFunc( gl.LEQUAL );
	
	var modelViewMatrix = mat4.create();
	
	var currentIB = null;

	for ( var i = 0; i < tiles.length; i++ )
	{
		var tile = tiles[i];
				
		// First retreive tileData for overlay
		var isTileLoaded = (tile.state == GlobWeb.Tile.State.LOADED);
		var tileData;
		
		if ( isTileLoaded )
			tileData = tile.extension.rasterOverlay;
		else if ( tile.parent) 
			tileData = tile.parent.extension.rasterOverlay;
			
		if ( tileData )
		{
			mat4.multiply( rc.viewMatrix, tile.matrix, modelViewMatrix );
			gl.uniformMatrix4fv(this.program.uniforms["modelViewMatrix"], false, modelViewMatrix);
						
			// Bind the vertex buffer
			gl.bindBuffer(gl.ARRAY_BUFFER, tile.vertexBuffer);
			gl.vertexAttribPointer(attributes['vertex'], 3, gl.FLOAT, false, 0, 0);
			
			// Bind the index buffer
			var indexBuffer = isTileLoaded ? this.tileManager.tileIndexBuffer.getSolid() : this.tileManager.tileIndexBuffer.getSubSolid(tile.parentIndex);
			// Bind the index buffer only if different (index buffer is shared between tiles)
			if ( currentIB != indexBuffer )
			{	
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
				currentIB = indexBuffer;
			}
			
			for ( var j = 0; j < tileData.renderables.length; j++ )
			{
				var renderable = tileData.renderables[j];
				
				// Skip not visible layer
				if ( !renderable.overlay._visible )
					continue;
				
				var uvScale = 1.0;
				var uTrans = 0.0;
				var vTrans = 0.0;
				
				// Retrieve the texture to use
				var textureTile = isTileLoaded ? tile : tile.parent;
				
				if ( !textureTile )
					continue;
					
				var prevTextureTile = textureTile;
				
				// Request high resolution first : always request the texture for the given tile
				if ( this.requestHighestResolutionFirst )
				{
					if ( !renderable.requestFinished )
					{	
						this.requestOverlayTextureForTile( textureTile, renderable );
					}
				}
				
				// If no texture on tile, try to find a valid texture with parent
				while ( !renderable.requestFinished && textureTile )
				{
					prevTextureTile = textureTile;
					textureTile = textureTile.parent;
					if ( textureTile )
					{
						uTrans *= 0.5;
						vTrans *= 0.5;
						uvScale *= 0.5;
						uTrans += (prevTextureTile.parentIndex & 1) ? 0.5 : 0;
						vTrans += (prevTextureTile.parentIndex & 2) ? 0.5 : 0;
						var data = textureTile.extension.rasterOverlay;
						renderable = data.findRenderable( renderable.overlay );
					}
				}
				
				// Request low resolution texture
				if ( !this.requestHighestResolutionFirst )
				{
					if ( prevTextureTile != textureTile )
					{
						this.requestOverlayTextureForTile( prevTextureTile, renderable );
					}
				}
				
				if ( textureTile && renderable.texture )
				{
					var tileGeoBound = isTileLoaded ? tile.geoBound : tile.parent.geoBound;
					gl.uniform1f(this.program.uniforms["opacity"], renderable.overlay._opacity );
					gl.uniform4f(this.program.uniforms["textureTransform"], uvScale, uvScale, uTrans, vTrans );
					
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, renderable.texture );
					
					// Finally draw the tiles
					gl.drawElements(gl.TRIANGLES, currentIB.numIndices, gl.UNSIGNED_SHORT, 0);
				}
			}
		}
	}

	gl.disable(gl.BLEND);
	gl.depthFunc( gl.LESS );
	
	// Abort image requests not requested for this renderering
	for ( var i = 0; i < this.imageRequests.length; i++ )
	{
		var iq = this.imageRequests[i];
		if ( iq.renderable && iq.frameNumber < this.frameNumber )
		{
			iq.renderable.request = null;
			iq.renderable = null;
			iq.src = '';
		}
	}
	
	this.frameNumber++;
}

//*************************************************************************
